-- ============================================================================
-- Stuntdouble Core Brain Architecture for Lua (UE4SS / Unreal 4-5, Cyber Engine Tweaks /
-- REDengine, Source / VScript, LuaJIT or Lua 5.3+)
-- Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
--
-- Pure-Lua implementation of the full 4-Layer cognitive kernel:
--   Layer 4: Narrative & Tactical Orchestrator (5 AutonomyModes, stance, camera)
--   Layer 3B: Regressive A* GOAP Planner (boolean proposition domain)
--   Layer 3A: Makeup-Value Compensated Utility AI (+ deterministic epsilon-delta jitter)
--   Layer 2: Tactical Blackboard + 2D Spatial Influence Map
--   Layer 1: 16-Slot Context Steering (Interest - Danger synthesis)
--
-- Lua 5.1 has no integer division or goto-free table.sort caveats that matter here,
-- so the module sticks to the 5.1 subset and runs unchanged on LuaJIT and 5.4.
--
-- Verified decision-for-decision against the TypeScript reference by
-- packages/conformance.
-- ============================================================================

local StuntBrain = {}
StuntBrain.__index = StuntBrain

StuntBrain.VERSION = "1.1.0"

-- Enum mirrors of the TypeScript string unions / C# / C++ enums.
StuntBrain.AutonomyMode = {
    FULL_COMBAT = 0,
    CO_PILOT = 1,
    GRIND_AUTOPILOT = 2,
    SHADOW_SURVIVAL = 3,
    COMMANDER = 4,
}

-- Composable behavior flags (bit mask). The five AutonomyMode names are presets over these.
-- Conflict rules: DEFENSIVE overrides offense; ASSIST is inert while COMBAT is set AND an enemy exists;
-- CRUISE runs only while no enemy exists; ASSIST+CRUISE: cruise when clear, human pass-through + reflex
-- intercept when an enemy exists; no active behavior => human input passes, Stuntdouble idle.
StuntBrain.Behavior = { COMBAT = 1, ASSIST = 2, CRUISE = 4, DEFENSIVE = 8, COMMAND = 16 }

StuntBrain.AutonomyPresets = {
    [0] = 1,      -- FULL_COMBAT     = COMBAT
    [1] = 2,      -- CO_PILOT        = ASSIST
    [2] = 4 + 1,  -- GRIND_AUTOPILOT = CRUISE | COMBAT
    [3] = 8,      -- SHADOW_SURVIVAL = DEFENSIVE
    [4] = 1 + 16, -- COMMANDER       = COMBAT | COMMAND
}

local function hasFlag(mask, flag) return math.floor(mask / flag) % 2 == 1 end -- LuaJIT-safe (no bitwise ops)

StuntBrain.PresentationMode = {
    TACTICAL = 0,
    CINEMATIC_LIVE = 1,
    CINEMATIC_RESOLVE = 2,
}

StuntBrain.Stance = {
    AGGRESSIVE = "AGGRESSIVE",
    BALANCED = "BALANCED",
    DEFENSIVE = "DEFENSIVE",
    EVASIVE = "EVASIVE",
    STEALTH = "STEALTH",
}

-- ============================================================================
-- SHARED MATH HELPERS (identical formulas in every Stuntdouble runtime)
-- ============================================================================

local function clamp01(x)
    if x < 0.0 then return 0.0 end
    if x > 1.0 then return 1.0 end
    return x
end

--- floor(x * 10^digits + 0.5) / 10^digits — shared rounding across runtimes.
local function quantize(value, digits)
    local scale = 10.0 ^ digits
    return math.floor(value * scale + 0.5) / scale
end

local function distXZ(a, b)
    local dx = b.x - a.x
    local dz = b.z - a.z
    return math.sqrt(dx * dx + dz * dz)
end

StuntBrain.clamp01 = clamp01
StuntBrain.quantize = quantize

-- ============================================================================
-- LAYER 3A: RESPONSE CURVES
-- ============================================================================

local Curves = {}

function Curves.linear(x)
    return clamp01(x)
end

function Curves.inverseLinear(x)
    return clamp01(1.0 - x)
end

function Curves.quadratic(x, k)
    return clamp01(x) ^ (k or 2.0)
end

function Curves.logistic(x, k, x0)
    k = k or 10.0
    x0 = x0 or 0.5
    return 1.0 / (1.0 + math.exp(-k * (clamp01(x) - x0)))
end

StuntBrain.Curves = Curves

-- ============================================================================
-- LAYER 3A: COMPENSATED UTILITY AI + DISCIPLINE JITTER
-- ============================================================================

--- Dave Mark's Makeup Value Compensation: score = prod(q_i + (1 - q_i) * mu * q_i).
function StuntBrain.compensatedUtility(scores)
    local n = #scores
    if n == 0 then return 0.0 end
    local modFactor = 1.0 - (1.0 / n)
    local total = 1.0
    for i = 1, n do
        local q = clamp01(scores[i])
        local makeup = (1.0 - q) * modFactor
        total = total * (q + makeup * q)
        if total <= 1e-6 then return 0.0 end
    end
    return total
end

local GOLDEN_CONJUGATE = 0.6180339887498949

--- Deterministic epsilon-delta discipline jitter (WHITEPAPER §Layer 3A).
local DisciplineJitter = {}
DisciplineJitter.__index = DisciplineJitter

function DisciplineJitter.new()
    return setmetatable({ cursor = 0 }, DisciplineJitter)
end

function DisciplineJitter:reset()
    self.cursor = 0
end

function DisciplineJitter:next(discipline)
    self.cursor = self.cursor + 1
    local scaled = self.cursor * GOLDEN_CONJUGATE
    local u = scaled - math.floor(scaled)
    local d = clamp01(discipline)
    return ((1.0 - d) / 10.0) * (2.0 * u - 1.0)
end

StuntBrain.DisciplineJitter = DisciplineJitter

--- UtilityAction: id + list of { evaluate = fn(bb) -> number, curve = fn(number) -> number }.
local UtilityAction = {}
UtilityAction.__index = UtilityAction

function UtilityAction.new(id, considerations)
    return setmetatable({ id = id, considerations = considerations or {} }, UtilityAction)
end

function UtilityAction:score(bb)
    local n = #self.considerations
    if n == 0 then return 0.0 end
    local modFactor = 1.0 - (1.0 / n)
    local running = 1.0
    for i = 1, n do
        local c = self.considerations[i]
        local raw = clamp01(c.evaluate(bb))
        local q = clamp01(c.curve(raw))
        local makeup = (1.0 - q) * modFactor
        running = running * (q + makeup * q)
        if running <= 1e-6 then return 0.0 end
    end
    return running
end

StuntBrain.UtilityAction = UtilityAction

-- ============================================================================
-- LAYER 1: 16-SLOT CONTEXT STEERING (Fray 2013 / Reynolds 1999)
-- ============================================================================

local ContextSteering = {}
ContextSteering.__index = ContextSteering

function ContextSteering.new(slotCount)
    slotCount = slotCount or 16
    local self = setmetatable({ slotCount = slotCount, directions = {} }, ContextSteering)
    for i = 0, slotCount - 1 do
        local angle = (i / slotCount) * math.pi * 2.0
        self.directions[i + 1] = { x = math.cos(angle), y = 0.0, z = math.sin(angle) }
    end
    self.interest = {}
    self.danger = {}
    return self
end

--- Conflict-free XZ movement: interest toward the preferred ring minus hazard cones.
function ContextSteering:computeMoveVector(selfPos, targetPos, preferredDistance, hazards)
    local slots = self.slotCount
    for i = 1, slots do
        self.interest[i] = 0.0
        self.danger[i] = 0.0
    end

    local dx = targetPos.x - selfPos.x
    local dz = targetPos.z - selfPos.z
    local dist = math.sqrt(dx * dx + dz * dz)
    local tx = dist > 1e-5 and (dx / dist) or 0.0
    local tz = dist > 1e-5 and (dz / dist) or 0.0

    for i = 1, slots do
        local d = self.directions[i]
        local dot = d.x * tx + d.z * tz
        if dist > preferredDistance * 1.15 then
            self.interest[i] = math.max(0.0, dot)                                   -- close the gap
        elseif dist < preferredDistance * 0.8 then
            self.interest[i] = math.max(0.0, -dot * 0.8 + (1.0 - math.abs(dot)) * 0.5) -- disengage
        else
            self.interest[i] = 1.0 - math.abs(dot)                                  -- strafe the ring
        end
    end

    for _, h in ipairs(hazards or {}) do
        local hx = h.position.x - selfPos.x
        local hz = h.position.z - selfPos.z
        local hDist = math.sqrt(hx * hx + hz * hz)
        if hDist < h.radius and hDist >= 1e-5 then
            local nx = hx / hDist
            local nz = hz / hDist
            local proximityUrgency = (1.0 - hDist / h.radius) * h.weight
            for i = 1, slots do
                local d = self.directions[i]
                local alignment = d.x * nx + d.z * nz
                if alignment > 0.0 then
                    local value = alignment * proximityUrgency
                    if value > self.danger[i] then self.danger[i] = value end
                end
            end
        end
    end

    local bestSlot = 1
    local bestScore = -1e308
    for i = 1, slots do
        local score = self.interest[i] - self.danger[i] * 1.35
        if score > bestScore then
            bestScore = score
            bestSlot = i
        end
    end

    local speedMultiplier = math.max(0.2, math.min(1.0, bestScore + 0.5))
    local chosen = self.directions[bestSlot]
    return { x = chosen.x, y = chosen.y, z = chosen.z }, speedMultiplier
end

StuntBrain.ContextSteering = ContextSteering

-- ============================================================================
-- LAYER 2: 2D SPATIAL INFLUENCE MAP
-- ============================================================================

local InfluenceMap2D = {}
InfluenceMap2D.__index = InfluenceMap2D

function InfluenceMap2D.new(gridSize, cellSize)
    gridSize = gridSize or 16
    cellSize = cellSize or 2.5
    local self = setmetatable({ gridSize = gridSize, cellSize = cellSize, grid = {} }, InfluenceMap2D)
    for i = 1, gridSize * gridSize do self.grid[i] = 0.0 end
    return self
end

function InfluenceMap2D:update(centerPos, hostiles, allies)
    local n = self.gridSize
    local cell = self.cellSize
    local halfSpan = (n * cell) / 2.0
    local idx = 0
    for gz = 0, n - 1 do
        for gx = 0, n - 1 do
            idx = idx + 1
            local worldX = centerPos.x - halfSpan + (gx + 0.5) * cell
            local worldZ = centerPos.z - halfSpan + (gz + 0.5) * cell

            local score = 0.0
            for _, h in ipairs(hostiles or {}) do
                local dx = worldX - h.position.x
                local dz = worldZ - h.position.z
                local d = math.sqrt(dx * dx + dz * dz)
                score = score - (h.threatWeight * (h.isWindUp and 1.75 or 1.0)) / (1.0 + d * 0.45)
            end
            for _, a in ipairs(allies or {}) do
                local dx = worldX - a.position.x
                local dz = worldZ - a.position.z
                local d = math.sqrt(dx * dx + dz * dz)
                score = score + a.threatWeight / (1.0 + d * 0.5)
            end
            self.grid[idx] = score
        end
    end
end

--- Highest scoring (safest) cell within the local grid.
function InfluenceMap2D:findSafestPocket(centerPos)
    local n = self.gridSize
    local cell = self.cellSize
    local halfSpan = (n * cell) / 2.0

    local bestIdx = 1
    local bestVal = -1e308
    for i = 1, #self.grid do
        if self.grid[i] > bestVal then
            bestVal = self.grid[i]
            bestIdx = i
        end
    end

    local zeroBased = bestIdx - 1
    local gx = zeroBased % n
    local gz = math.floor(zeroBased / n)
    return {
        x = centerPos.x - halfSpan + (gx + 0.5) * cell,
        y = centerPos.y,
        z = centerPos.z - halfSpan + (gz + 0.5) * cell,
    }
end

StuntBrain.InfluenceMap2D = InfluenceMap2D

-- ============================================================================
-- LAYER 2: TACTICAL BLACKBOARD
-- ============================================================================

local TacticalBlackboard = {}
TacticalBlackboard.__index = TacticalBlackboard

function TacticalBlackboard.new()
    return setmetatable({
        self = nil,
        hostiles = {},
        profile = nil,
        presentationMode = StuntBrain.PresentationMode.TACTICAL,
        stance = StuntBrain.Stance.BALANCED,
        primaryTarget = nil,
        imminentThreat = nil,
        rangedThreat = nil, -- nearest ranged hostile winding up (<= 16 m) or with a projectile in flight
        pressureIndex = 0.0,
        influenceMap = InfluenceMap2D.new(12, 2.5),
    }, TacticalBlackboard)
end

function TacticalBlackboard:refresh(selfState, hostiles, profile)
    self.self = selfState
    self.profile = profile
    self.hostiles = {}
    for _, h in ipairs(hostiles or {}) do
        if h.healthRatio > 0 then self.hostiles[#self.hostiles + 1] = h end
    end

    local nearestDist = 1e308
    local bestTarget = nil
    local windUpThreat = nil
    local rangedThreatPick = nil
    local rangedDist = 1e308
    local rawPressure = 0.0

    for _, h in ipairs(self.hostiles) do
        local d = distXZ(selfState.position, h.position)
        rawPressure = rawPressure + h.threatWeight / math.max(1.0, d * 0.35)
        if h.isWindUp and d < 4.5 and not h.isRanged then windUpThreat = h end
        if h.isRanged and ((h.isWindUp and d <= 16.0) or (h.projectileEta or 0.0) > 0.0) and d < rangedDist then
            rangedDist = d
            rangedThreatPick = h
        end
        local key = h.isRanged and (d * 0.5) or d
        if key < nearestDist then
            nearestDist = key
            bestTarget = h
        end
    end

    self.primaryTarget = bestTarget
    self.imminentThreat = windUpThreat
    self.rangedThreat = rangedThreatPick
    self.pressureIndex = math.min(1.0, rawPressure / 3.5)
    self.influenceMap:update(selfState.position, self.hostiles)
end

function TacticalBlackboard:targetDistance()
    if not self.primaryTarget then return 1e308 end
    return distXZ(self.self.position, self.primaryTarget.position)
end

function TacticalBlackboard:toWorldState()
    local hasTarget = self.primaryTarget ~= nil
    local dist = self:targetDistance()
    local preferred = self.profile and self.profile.preferredRange or 0.0

    return {
        hasHostiles = #self.hostiles > 0,
        inMeleeRange = dist <= 2.8,
        inPreferredRange = dist <= preferred * 1.2,
        underImminentAttack = self.imminentThreat ~= nil,
        threatNeutralized = self.imminentThreat == nil,
        healthCritical = self.self.healthRatio < 0.3,
        staminaSufficient = self.self.staminaRatio > 0.25,
        targetVulnerable = hasTarget and self.primaryTarget.healthRatio < 0.25,
        enemyEliminated = not hasTarget,
        survived = self.self.healthRatio >= 0.65 and self.imminentThreat == nil,
    }
end

StuntBrain.TacticalBlackboard = TacticalBlackboard

-- ============================================================================
-- LAYER 3B: REGRESSIVE A* GOAP PLANNER (Orkin 2006 / F.E.A.R.)
-- ============================================================================

local GoapPlanner = {}
GoapPlanner.__index = GoapPlanner

function GoapPlanner.new()
    return setmetatable({ sequence = 0 }, GoapPlanner)
end

local function wsCopy(source)
    local copy = {}
    for k, v in pairs(source or {}) do copy[k] = v end
    return copy
end

--- Keys sorted so the closed-set identity is runtime-independent.
local function serializeState(state)
    local keys = {}
    for k in pairs(state) do keys[#keys + 1] = k end
    table.sort(keys)
    local parts = {}
    for i = 1, #keys do
        parts[i] = keys[i] .. ":" .. (state[keys[i]] and "true" or "false")
    end
    return table.concat(parts, "|")
end

local function isSatisfied(current, required)
    for k, v in pairs(required) do
        if current[k] ~= v then return false end
    end
    return true
end

local function doesActionSatisfyAny(action, unmetGoal, currentState)
    local helps = false
    for k, v in pairs(action.effects) do
        local goalValue = unmetGoal[k]
        if goalValue ~= nil then
            local isNow = (currentState[k] == goalValue)
            if goalValue == v and not isNow then
                helps = true
            elseif goalValue ~= v then
                return false
            end
        end
    end
    return helps
end

local function regressState(unmetGoal, action)
    local next_ = wsCopy(unmetGoal)
    for k in pairs(action.effects) do next_[k] = nil end
    for k, v in pairs(action.preconditions or {}) do next_[k] = v end
    return next_
end

local function heuristic(current, required)
    local diff = 0
    for k, v in pairs(required) do
        if current[k] ~= v then diff = diff + 1 end
    end
    return diff * 0.5
end

--- Backward regressive A* from the goal proposition set to the live world state.
function GoapPlanner:plan(currentState, goalState, availableActions, blackboard)
    self.sequence = 0

    local function newNode(unmetGoal, actions, gCost, fCost)
        self.sequence = self.sequence + 1
        return {
            unmetGoal = unmetGoal,
            actions = actions,
            gCost = gCost,
            fCost = fCost,
            seq = self.sequence,
        }
    end

    local openSet = { newNode(wsCopy(goalState), {}, 0.0, heuristic(currentState, goalState)) }
    local closedSet = {}
    local iterations = 0
    local MAX_ITERATIONS = 256

    while #openSet > 0 and iterations < MAX_ITERATIONS do
        iterations = iterations + 1

        local bestIndex = 1
        for i = 2, #openSet do
            local a, b = openSet[i], openSet[bestIndex]
            if a.fCost < b.fCost or (a.fCost == b.fCost and a.seq < b.seq) then
                bestIndex = i
            end
        end

        local current = openSet[bestIndex]
        table.remove(openSet, bestIndex)

        if isSatisfied(currentState, current.unmetGoal) then
            local plan = {}
            for i = #current.actions, 1, -1 do
                plan[#plan + 1] = current.actions[i]
            end
            return plan
        end

        local key = serializeState(current.unmetGoal)
        if not closedSet[key] then
            closedSet[key] = true

            for _, action in ipairs(availableActions) do
                if doesActionSatisfyAny(action, current.unmetGoal, currentState) then
                    local nextUnmet = regressState(current.unmetGoal, action)
                    local stepCost = action.dynamicCost and action.dynamicCost(blackboard) or action.baseCost
                    local g = current.gCost + math.max(0.05, stepCost)
                    local h = heuristic(currentState, nextUnmet)

                    local chain = {}
                    for i = 1, #current.actions do chain[i] = current.actions[i] end
                    chain[#chain + 1] = action

                    openSet[#openSet + 1] = newNode(nextUnmet, chain, g, g + h)
                end
            end
        end
    end

    return nil
end

StuntBrain.GoapPlanner = GoapPlanner

-- ============================================================================
-- DEFAULT ACTION TABLES
-- ============================================================================

function StuntBrain.defaultUtilityActions()
    return {
        UtilityAction.new("DEFLECT_COUNTER", {
            { evaluate = function(bb) return bb.imminentThreat and 1.0 or 0.0 end, curve = Curves.linear },
            { evaluate = function(bb) return bb.profile.cinematicFlair * 0.5 + 0.5 end, curve = Curves.linear },
        }),
        UtilityAction.new("EXECUTE_FINISHER", {
            { evaluate = function(bb)
                return bb.primaryTarget and (1.0 - bb.primaryTarget.healthRatio) or 0.0
            end, curve = function(x) return Curves.logistic(x) end },
            { evaluate = function(bb)
                if not bb.primaryTarget then return 0.0 end
                return math.max(0.0, 1.0 - bb:targetDistance() / 3.5)
            end, curve = function(x) return Curves.quadratic(x) end },
        }),
        UtilityAction.new("EVADE_REPOSITION", {
            { evaluate = function(bb) return 1.0 - bb.self.healthRatio end,
              curve = function(x) return Curves.logistic(x, 12.0, 0.65) end },
            { evaluate = function(bb) return bb.pressureIndex end, curve = Curves.linear },
        }),
        UtilityAction.new("STRIKE_COMBO", {
            { evaluate = function(bb) return bb.self.staminaRatio end, curve = Curves.linear },
            { evaluate = function(bb) return bb.profile.aggression end, curve = Curves.linear },
        }),
    }
end

function StuntBrain.defaultGoapActions()
    return {
        {
            name = "CLOSE_DISTANCE",
            preconditions = { hasHostiles = true },
            effects = { inMeleeRange = true, inPreferredRange = true },
            baseCost = 1.0,
        },
        {
            name = "DEFLECT_COUNTER",
            preconditions = { underImminentAttack = true },
            effects = { underImminentAttack = false, threatNeutralized = true, targetVulnerable = true },
            baseCost = 0.6,
        },
        {
            name = "HEAVY_ASSAULT",
            preconditions = { inMeleeRange = true, staminaSufficient = true },
            effects = { targetVulnerable = true },
            baseCost = 1.1,
        },
        {
            name = "EXECUTE_FINISHER",
            preconditions = { inMeleeRange = true, targetVulnerable = true },
            effects = { enemyEliminated = true, threatNeutralized = true },
            baseCost = 0.4,
        },
        {
            name = "TACTICAL_HEAL",
            preconditions = { healthCritical = true },
            effects = { healthCritical = false, survived = true },
            baseCost = 0.8,
        },
        {
            name = "EVADE_TO_COVER",
            preconditions = { underImminentAttack = true },
            effects = { underImminentAttack = false, survived = true, threatNeutralized = true },
            baseCost = 0.9,
        },
    }
end

-- ============================================================================
-- LAYER 4: ORCHESTRATOR + UNIFIED KERNEL
-- ============================================================================

function StuntBrain.new(profile, options)
    options = options or {}
    local self = setmetatable({}, StuntBrain)

    self.profile = profile or {
        id = "protagonist_default",
        name = "Protagonist",
        aggression = 0.78,
        discipline = 0.90,
        cinematicFlair = 0.85,
        reactionDelayMs = 90,
        preferredRange = 2.2,
    }

    self.presentationMode = StuntBrain.PresentationMode.TACTICAL
    self.autonomyMode = StuntBrain.AutonomyMode.FULL_COMBAT

    self.blackboard = TacticalBlackboard.new()
    self.steering = ContextSteering.new(16)
    self.planner = GoapPlanner.new()
    self.jitter = DisciplineJitter.new()

    self.utilityActions = options.utilityActions or StuntBrain.defaultUtilityActions()
    self.goapActions = options.goapActions or StuntBrain.defaultGoapActions()

    return self
end

function StuntBrain:cyclePresentationMode()
    self.presentationMode = (self.presentationMode + 1) % 3
    return self.presentationMode
end

function StuntBrain:cycleAutonomyMode()
    self.autonomyMode = (self.autonomyMode + 1) % 5
    return self.autonomyMode
end

function StuntBrain:evaluateStance()
    local bb = self.blackboard
    if #bb.hostiles == 0 then return StuntBrain.Stance.STEALTH end
    if bb.self.healthRatio < 0.28 then return StuntBrain.Stance.EVASIVE end
    if bb.imminentThreat ~= nil or bb.pressureIndex > 0.72 then return StuntBrain.Stance.DEFENSIVE end
    if bb.profile.aggression >= 0.65 and bb.self.staminaRatio > 0.35 then return StuntBrain.Stance.AGGRESSIVE end
    return StuntBrain.Stance.BALANCED
end

function StuntBrain:selectGoalForStance(stance)
    if stance == StuntBrain.Stance.EVASIVE then
        return { survived = true }
    elseif stance == StuntBrain.Stance.DEFENSIVE or stance == StuntBrain.Stance.STEALTH then
        return { threatNeutralized = true }
    end
    return { enemyEliminated = true }
end

function StuntBrain:computeCameraDirective(mode, command)
    local targetId = self.blackboard.primaryTarget and self.blackboard.primaryTarget.id or nil

    if mode == StuntBrain.PresentationMode.TACTICAL then
        return { mode = "PASSIVE", timeScale = 1.0, fovMultiplier = 1.0, focusTargetId = targetId }
    end

    if mode == StuntBrain.PresentationMode.CINEMATIC_RESOLVE then
        return { mode = "FINISH_CUT", timeScale = 1.75, fovMultiplier = 0.82, focusTargetId = targetId }
    end

    if command == "EXECUTE_FINISHER" or command == "DEFLECT_COUNTER" then
        return {
            mode = "IMPACT_SLOWMO",
            timeScale = self.profile.cinematicFlair > 0.5 and 0.35 or 0.65,
            fovMultiplier = 0.85,
            focusTargetId = targetId,
        }
    end

    return { mode = "ACTION_TRACK", timeScale = 1.0, fovMultiplier = 0.92, focusTargetId = targetId }
end

--- Executes one cognitive tick across all four architectural layers.
function StuntBrain:tick(selfState, hostiles, profile, presentationMode, autonomyMode, waypointOrLootPos)
    autonomyMode = autonomyMode or self.autonomyMode
    local d = self:tickBehaviors(selfState, hostiles, profile, presentationMode,
        StuntBrain.AutonomyPresets[autonomyMode], waypointOrLootPos)
    d.autonomyMode = autonomyMode
    return d
end

--- Same tick driven by a raw Behavior mask (legacy names map to presets via tick()).
function StuntBrain:tickBehaviors(selfState, hostiles, profile, presentationMode, behaviors, waypointOrLootPos)
    profile = profile or self.profile
    presentationMode = presentationMode or self.presentationMode

    -- 1. Layer 2 — blackboard + influence map
    self.blackboard.presentationMode = presentationMode
    self.blackboard:refresh(selfState, hostiles, profile)

    -- [FLAGS] resolve behaviors (identical block in every port)
    local B = StuntBrain.Behavior
    local hasEnemy = #self.blackboard.hostiles > 0
    local fCombat = hasFlag(behaviors, B.COMBAT)
    local fDefensive = hasFlag(behaviors, B.DEFENSIVE)
    local assistActive = hasFlag(behaviors, B.ASSIST) and not (fCombat and hasEnemy)
    local cruiseActive = hasFlag(behaviors, B.CRUISE) and not hasEnemy
    local inactive = not (fCombat or fDefensive or assistActive or cruiseActive)

    -- 2. Layer 4 — stance & high-level goal
    local stance
    if fDefensive then
        stance = StuntBrain.Stance.DEFENSIVE
    else
        stance = self:evaluateStance()
    end
    self.blackboard.stance = stance
    local goalState = self:selectGoalForStance(stance)

    -- 3. Layer 3A — compensated utility + deterministic jitter
    local bestUtility = self.utilityActions[1]
    local bestScore = -1.0
    self.jitter:reset()
    for _, ua in ipairs(self.utilityActions) do
        local skip = fDefensive
            and (ua.id == "STRIKE_COMBO" or ua.id == "EXECUTE_FINISHER")
        if not skip then
            local jittered = ua:score(self.blackboard) + self.jitter:next(profile.discipline)
            local s = clamp01(jittered)
            if s > bestScore then
                bestScore = s
                bestUtility = ua
            end
        end
    end

    -- 4. Layer 3B — regressive A* plan
    local worldState = self.blackboard:toWorldState()
    local rawPlan = self.planner:plan(worldState, goalState, self.goapActions, self.blackboard) or {}
    local goapPlanNames = {}
    for i = 1, #rawPlan do goapPlanNames[i] = rawPlan[i].name end

    -- Autonomy-mode command & human-input interception policy
    local immediateCommand
    if bestScore > 0.78 + 0.4 * (0.78 - profile.aggression) then -- [CORE-003] continuous commit threshold
        immediateCommand = bestUtility.id
    elseif #goapPlanNames > 0 then
        immediateCommand = goapPlanNames[1]
    else
        immediateCommand = bestUtility.id
    end
    local interceptHumanInput = true

    if inactive then
        -- [FLAGS] no active behavior: human input passes, Stuntdouble does nothing
        interceptHumanInput = false
        immediateCommand = "HUMAN_PASS_THROUGH"
    elseif cruiseActive then
        immediateCommand = waypointOrLootPos and "CRUISE_OR_LOOT" or "IDLE_SCAN"
    elseif assistActive then
        local isUrgentReflex =
            (bestUtility.id == "DEFLECT_COUNTER" or bestUtility.id == "EVADE_REPOSITION")
            and bestScore >= 0.75
        interceptHumanInput = isUrgentReflex or selfState.healthRatio < 0.25
        if not interceptHumanInput then immediateCommand = "HUMAN_PASS_THROUGH" end
    end

    -- [CORE-003] continuous aggression: stamina reserve = (1 - aggression) * 0.6
    if not inactive and not cruiseActive and not assistActive and self.blackboard.imminentThreat == nil
        and (immediateCommand == "STRIKE_COMBO" or immediateCommand == "HEAVY_ASSAULT")
        and selfState.staminaRatio < (1.0 - profile.aggression) * 0.9 then
        immediateCommand = "CLOSE_DISTANCE"
    end

    -- [CORE-003] critical health and nothing about to land in melee: heal beats fleeing
    if not inactive and not cruiseActive and not assistActive and self.blackboard.imminentThreat == nil
        and selfState.healthRatio < 0.3 and #goapPlanNames > 0 and goapPlanNames[1] == "TACTICAL_HEAL" then
        immediateCommand = "TACTICAL_HEAL"
    end

    -- [CORE-003] ranged threat: lateral sidestep, dodge timed to the projectile (impact within 0.4 s)
    local rt = self.blackboard.rangedThreat
    local rangedReflex = (not inactive) and rt ~= nil and self.blackboard.imminentThreat == nil
        and immediateCommand ~= "TACTICAL_HEAL"
    if rangedReflex then
        local eta = rt.projectileEta or 0.0
        local dodgeNow = eta > 0.0 and eta <= 0.4
        if dodgeNow then immediateCommand = "EVADE_REPOSITION" end
        if dodgeNow or not assistActive then interceptHumanInput = true end
    end

    -- 5. Layer 1 — context steering synthesis
    local navTarget = selfState.position
    if cruiseActive and waypointOrLootPos then
        navTarget = waypointOrLootPos
    elseif stance == StuntBrain.Stance.EVASIVE or stance == StuntBrain.Stance.DEFENSIVE then
        navTarget = self.blackboard.influenceMap:findSafestPocket(selfState.position)
    elseif self.blackboard.primaryTarget then
        navTarget = self.blackboard.primaryTarget.position
    end

    local hazards = {}
    for _, h in ipairs(self.blackboard.hostiles) do
        hazards[#hazards + 1] = {
            position = h.position,
            radius = h.isWindUp and 4.2 or 2.5,
            weight = h.threatWeight * (h.isWindUp and 1.8 or 1.0),
        }
    end

    local prefRange
    if cruiseActive then
        prefRange = 0.5
    else
        prefRange = profile.preferredRange
    end

    local moveDir, speedMultiplier =
        self.steering:computeMoveVector(selfState.position, navTarget, prefRange, hazards)
    if inactive then
        -- [FLAGS] idle: no steering output
        moveDir = { x = 0.0, y = 0.0, z = 0.0 }
        speedMultiplier = 0.0
    elseif rangedReflex then
        local ux = rt.position.x - selfState.position.x
        local uz = rt.position.z - selfState.position.z
        local ul = math.sqrt(ux * ux + uz * uz)
        if ul > 1e-6 then ux = ux / ul; uz = uz / ul else ux = 0.0; uz = 0.0 end
        local lx = -uz
        local lz = ux
        local vel = selfState.velocity or { x = 0.0, y = 0.0, z = 0.0 }
        local side = (vel.x * lx + vel.z * lz >= 0.0) and 1.0 or -1.0
        local mx = side * lx + (1.0 + profile.aggression * 0.6) * ux
        local mz = side * lz + (1.0 + profile.aggression * 0.6) * uz
        local ml = math.sqrt(mx * mx + mz * mz)
        if ml > 1e-9 then mx = mx / ml; mz = mz / ml else mx = 0.0; mz = 0.0 end
        moveDir = { x = mx, y = 0.0, z = mz }
        speedMultiplier = 1.0
    end

    -- 6. Layer 4 — presentation director
    local camera = self:computeCameraDirective(presentationMode, immediateCommand)

    return {
        autonomyMode = StuntBrain.AutonomyMode.FULL_COMBAT, -- legacy name echo (set by tick())
        behaviors = behaviors,
        stance = stance,
        interceptHumanInput = interceptHumanInput,
        selectedUtilityAction = bestUtility.id,
        utilityScore = quantize(bestScore, 4),
        goapPlan = goapPlanNames,
        immediateCommand = immediateCommand,
        steeringMove = moveDir,
        speedMultiplier = quantize(speedMultiplier, 3),
        cameraDirective = camera,
    }
end

return StuntBrain
