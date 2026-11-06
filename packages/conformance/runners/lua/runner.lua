-- AUTOMA conformance runner (Lua 5.4 / LuaJIT). Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
-- Usage: lua packages/conformance/runners/lua/runner.lua   (run from anywhere)
-- Legacy-name scenarios run through BOTH tick(autonomyEnum) and tickBehaviors(mask).
local script = (arg and arg[0]) or "runner.lua"
local dir = script:gsub("\\", "/"):match("^(.*)/") or "."
package.path = dir .. "/../../fixtures/?.lua;" .. dir .. "/../../../automa-brain-lua/?.lua;" .. package.path

local AutomaBrain = require("automa_brain")
local fixtures = require("fixtures")
local expected = require("expected")

local TOL = 1e-6

local function cmpNum(errs, field, got, want)
    if got == nil or math.abs(got - want) > TOL then
        errs[#errs + 1] = field .. ": got " .. tostring(got) .. " want " .. tostring(want)
    end
end

local function cmpStr(errs, field, got, want)
    if got ~= want then
        errs[#errs + 1] = field .. ": got " .. tostring(got) .. " want " .. tostring(want)
    end
end

local function diff(d, e)
    local errs = {}
    cmpStr(errs, "stance", d.stance, e.stance)
    cmpStr(errs, "interceptHumanInput", tostring(d.interceptHumanInput), tostring(e.intercept))
    cmpStr(errs, "selectedUtilityAction", d.selectedUtilityAction, e.utility)
    cmpNum(errs, "utilityScore", d.utilityScore, e.score)
    cmpStr(errs, "goapPlan", table.concat(d.goapPlan, ">"), table.concat(e.plan, ">"))
    cmpStr(errs, "immediateCommand", d.immediateCommand, e.command)
    cmpNum(errs, "steering.x", d.steeringMove.x, e.sx)
    cmpNum(errs, "steering.z", d.steeringMove.z, e.sz)
    cmpNum(errs, "speedMultiplier", d.speedMultiplier, e.speed)
    cmpStr(errs, "camera.mode", d.cameraDirective.mode, e.camMode)
    cmpNum(errs, "camera.timeScale", d.cameraDirective.timeScale, e.timeScale)
    cmpNum(errs, "camera.fovMultiplier", d.cameraDirective.fovMultiplier, e.fov)
    cmpStr(errs, "camera.focusTargetId", d.cameraDirective.focusTargetId, e.focus)
    return errs
end

if #fixtures ~= #expected then
    print(string.format("FAIL: fixtures (%d) and expected (%d) differ in length", #fixtures, #expected))
    os.exit(1)
end

local passed = 0
for i, f in ipairs(fixtures) do
    local e = expected[i]
    local wp = f.hasWaypoint and f.waypoint or nil
    local errs = {}
    if f.id ~= e.id then errs[#errs + 1] = "id mismatch: fixture " .. f.id .. " vs expected " .. e.id end

    if f.autonomy ~= nil then
        local brain = AutomaBrain.new(f.profile, {})
        for _, m in ipairs(diff(brain:tick(f.self, f.hostiles, f.profile, f.presentation, f.autonomy, wp), e)) do
            errs[#errs + 1] = "[enum] " .. m
        end
    end
    local brain2 = AutomaBrain.new(f.profile, {})
    for _, m in ipairs(diff(brain2:tickBehaviors(f.self, f.hostiles, f.profile, f.presentation, f.behaviors, wp), e)) do
        errs[#errs + 1] = "[mask] " .. m
    end

    if #errs == 0 then
        passed = passed + 1
    else
        for _, m in ipairs(errs) do print("FAIL " .. f.id .. " " .. m) end
    end
end

print(string.format("Lua: %d/%d passed", passed, #fixtures))
os.exit(passed == #fixtures and 0 or 1)
