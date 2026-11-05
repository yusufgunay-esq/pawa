-- ============================================================================
-- PAWA Core Brain Architecture for Lua (UE4SS / Cyber Engine Tweaks / Source / REDengine)
-- Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
-- Zero-dependency 4-Layer Cognitive Kernel:
--   1. 16-Slot Context Steering (Interest - Danger Vector Synthesis)
--   2. Tactical Blackboard & Threat Evaluation
--   3. Dave Mark's Compensated Utility AI Scorer + Regressive GOAP Step Selection
--   4. Tri-Modal Presentation Director (TACTICAL | CINEMATIC_LIVE | CINEMATIC_RESOLVE)
-- ============================================================================

local PawaBrain = {}
PawaBrain.__index = PawaBrain

PawaBrain.Modes = {
    TACTICAL = "TACTICAL",
    CINEMATIC_LIVE = "CINEMATIC_LIVE",
    CINEMATIC_RESOLVE = "CINEMATIC_RESOLVE"
}

local function clamp01(x)
    if x < 0.0 then return 0.0 end
    if x > 1.0 then return 1.0 end
    return x
end

local function distXZ(a, b)
    local dx = b.x - a.x
    local dz = b.z - a.z
    return math.sqrt(dx * dx + dz * dz)
end

--- Dave Mark's Makeup Value Compensated multiplicative utility scorer.
function PawaBrain.compensatedUtility(scores)
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

function PawaBrain.new(persona)
    local self = setmetatable({}, PawaBrain)
    self.persona = persona or {
        id = "protagonist_default",
        aggression = 0.78,
        discipline = 0.90,
        cinematicFlair = 0.85,
        preferredRange = 2.2
    }
    self.presentationMode = PawaBrain.Modes.TACTICAL
    self.directions = {}
    for i = 1, 16 do
        local angle = ((i - 1) / 16.0) * math.pi * 2.0
        self.directions[i] = { x = math.cos(angle), y = 0.0, z = math.sin(angle) }
    end
    return self
end

function PawaBrain:cycleMode()
    if self.presentationMode == PawaBrain.Modes.TACTICAL then
        self.presentationMode = PawaBrain.Modes.CINEMATIC_LIVE
    elseif self.presentationMode == PawaBrain.Modes.CINEMATIC_LIVE then
        self.presentationMode = PawaBrain.Modes.CINEMATIC_RESOLVE
    else
        self.presentationMode = PawaBrain.Modes.TACTICAL
    end
    return self.presentationMode
end

function PawaBrain:computeSteering(selfPos, targetPos, hostiles)
    local interest = {}
    local danger = {}
    local dx = targetPos.x - selfPos.x
    local dz = targetPos.z - selfPos.z
    local dist = math.sqrt(dx * dx + dz * dz)
    local tx = dist > 1e-5 and (dx / dist) or 0.0
    local tz = dist > 1e-5 and (dz / dist) or 0.0
    local pref = self.persona.preferredRange

    for i = 1, 16 do
        local d = self.directions[i]
        local dot = d.x * tx + d.z * tz
        if dist > pref * 1.15 then
            interest[i] = math.max(0.0, dot)
        elseif dist < pref * 0.8 then
            interest[i] = math.max(0.0, -dot * 0.8 + (1.0 - math.abs(dot)) * 0.5)
        else
            interest[i] = 1.0 - math.abs(dot)
        end
        danger[i] = 0.0
    end

    for _, h in ipairs(hostiles) do
        if h.healthRatio > 0 then
            local hx = h.position.x - selfPos.x
            local hz = h.position.z - selfPos.z
            local hDist = math.sqrt(hx * hx + hz * hz)
            local rad = h.isWindUp and 4.2 or 2.5
            if hDist < rad and hDist > 1e-5 then
                local nx = hx / hDist
                local nz = hz / hDist
                local urgency = (1.0 - hDist / rad) * (h.threatWeight or 1.0) * (h.isWindUp and 1.8 or 1.0)
                for i = 1, 16 do
                    local d = self.directions[i]
                    local align = d.x * nx + d.z * nz
                    if align > 0 then
                        local val = align * urgency
                        if val > danger[i] then danger[i] = val end
                    end
                end
            end
        end
    end

    local bestSlot = 1
    local bestScore = -1e9
    for i = 1, 16 do
        local s = interest[i] - danger[i] * 1.35
        if s > bestScore then
            bestScore = s
            bestSlot = i
        end
    end

    local speedMult = math.max(0.2, math.min(1.0, bestScore + 0.5))
    return self.directions[bestSlot], speedMult
end

function PawaBrain:tick(selfState, hostiles)
    local primary = nil
    local windUpThreat = nil
    local nearestDist = 1e9

    for _, h in ipairs(hostiles) do
        if h.healthRatio > 0 then
            local d = distXZ(selfState.position, h.position)
            if h.isWindUp and d < 4.5 then
                windUpThreat = h
            end
            if d < nearestDist then
                nearestDist = d
                primary = h
            end
        end
    end

    local stance = "BALANCED"
    if not primary then
        stance = "STEALTH"
    elseif selfState.healthRatio < 0.28 then
        stance = "EVASIVE"
    elseif windUpThreat ~= nil then
        stance = "DEFENSIVE"
    elseif self.persona.aggression >= 0.65 and selfState.staminaRatio > 0.35 then
        stance = "AGGRESSIVE"
    end

    local deflectScore = PawaBrain.compensatedUtility({
        windUpThreat and 1.0 or 0.0,
        self.persona.cinematicFlair * 0.5 + 0.5
    })

    local finisherScore = primary and PawaBrain.compensatedUtility({
        clamp01(1.0 - primary.healthRatio * 2.5),
        clamp01(1.0 - nearestDist / 3.5)
    }) or 0.0

    local strikeScore = primary and PawaBrain.compensatedUtility({
        selfState.staminaRatio,
        self.persona.aggression
    }) or 0.0

    local command = "IDLE_SCAN"
    local bestScore = 0.0
    if deflectScore >= finisherScore and deflectScore >= strikeScore and deflectScore > 0.1 then
        command = "DEFLECT_COUNTER"
        bestScore = deflectScore
    elseif finisherScore >= strikeScore and finisherScore > 0.45 then
        command = "EXECUTE_FINISHER"
        bestScore = finisherScore
    elseif primary then
        command = (nearestDist > self.persona.preferredRange * 1.25) and "CLOSE_DISTANCE" or "STRIKE_COMBO"
        bestScore = strikeScore
    end

    local targetPos = primary and primary.position or selfState.position
    local moveDir, speedMult = self:computeSteering(selfState.position, targetPos, hostiles)

    local camera = {
        mode = "PASSIVE",
        timeScale = 1.0,
        fovMultiplier = 1.0,
        focusTargetId = primary and primary.id or nil
    }

    if self.presentationMode == PawaBrain.Modes.CINEMATIC_RESOLVE then
        camera.mode = "FINISH_CUT"
        camera.timeScale = 1.75
        camera.fovMultiplier = 0.82
    elseif self.presentationMode == PawaBrain.Modes.CINEMATIC_LIVE then
        if command == "DEFLECT_COUNTER" or command == "EXECUTE_FINISHER" then
            camera.mode = "IMPACT_SLOWMO"
            camera.timeScale = 0.35
            camera.fovMultiplier = 0.85
        else
            camera.mode = "ACTION_TRACK"
            camera.timeScale = 1.0
            camera.fovMultiplier = 0.92
        end
    end

    return {
        stance = stance,
        immediateCommand = command,
        utilityScore = bestScore,
        steeringMove = moveDir,
        speedMultiplier = speedMult,
        cameraDirective = camera
    }
end

return PawaBrain
