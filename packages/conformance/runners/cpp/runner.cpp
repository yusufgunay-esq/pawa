// AUTOMA conformance runner (C++20). Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
// Build: g++ -std=c++20 -O2 -I packages/automa-brain-cpp/include -I packages/conformance/fixtures \
//            packages/conformance/runners/cpp/runner.cpp -o runner && ./runner
// Legacy-name scenarios run through BOTH tick(AutonomyMode) and tick_behaviors(mask).
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

#include "automa/automa_brain.hpp"
#include "fixtures.hpp"
#include "expected.hpp"

namespace {

constexpr double kTol = 1e-6;
using automa::conformance::ExpectedDecision;

void cmp_num(std::vector<std::string>& errs, const char* field, double got, double want) {
    if (!(std::fabs(got - want) <= kTol)) {
        errs.push_back(std::string(field) + ": got " + std::to_string(got) + " want " + std::to_string(want));
    }
}

void cmp_str(std::vector<std::string>& errs, const char* field, const std::string& got, const std::string& want) {
    if (got != want) errs.push_back(std::string(field) + ": got " + got + " want " + want);
}

std::vector<std::string> diff(const automa::Decision& d, const ExpectedDecision& e) {
    std::vector<std::string> errs;
    cmp_str(errs, "stance", automa::to_string(d.stance), e.stance);
    cmp_str(errs, "interceptHumanInput", d.intercept_human_input ? "true" : "false", e.intercept ? "true" : "false");
    cmp_str(errs, "selectedUtilityAction", std::string(d.selected_utility_action), e.utility);
    cmp_num(errs, "utilityScore", d.utility_score, e.score);
    std::string plan, want_plan;
    for (auto p : d.goap_plan) { plan += std::string(p) + ">"; }
    for (const auto& p : e.plan) { want_plan += p + ">"; }
    cmp_str(errs, "goapPlan", plan, want_plan);
    cmp_str(errs, "immediateCommand", std::string(d.immediate_command), e.command);
    cmp_num(errs, "steering.x", d.steering_dir.x, e.sx);
    cmp_num(errs, "steering.z", d.steering_dir.z, e.sz);
    cmp_num(errs, "speedMultiplier", d.speed_multiplier, e.speed);
    cmp_str(errs, "camera.mode", std::string(d.camera.mode), e.cam_mode);
    cmp_num(errs, "camera.timeScale", d.camera.time_scale, e.time_scale);
    cmp_num(errs, "camera.fovMultiplier", d.camera.fov_multiplier, e.fov);
    const bool got_focus = d.camera.focus_target_id != nullptr;
    cmp_str(errs, "camera.focusTargetId", got_focus ? *d.camera.focus_target_id : "<null>",
            e.has_focus ? e.focus : "<null>");
    return errs;
}

} // namespace

int main() {
    const auto& fx = automa::conformance::fixtures();
    const auto& ex = automa::conformance::expected();
    if (fx.size() != ex.size()) {
        std::printf("FAIL: fixtures (%zu) and expected (%zu) differ in length\n", fx.size(), ex.size());
        return 1;
    }

    std::size_t passed = 0;
    for (std::size_t i = 0; i < fx.size(); ++i) {
        const auto& f = fx[i];
        const auto& e = ex[i];
        const automa::Vec3* wp = f.has_waypoint ? &f.waypoint : nullptr;
        std::vector<std::string> errs;
        if (f.id != e.id) errs.push_back("id mismatch: fixture " + f.id + " vs expected " + e.id);

        if (f.has_autonomy) {
            automa::BrainKernel k1;
            for (auto& m : diff(k1.tick(f.self, f.hostiles, f.profile, f.presentation, f.autonomy, wp), e)) {
                errs.push_back("[enum] " + m);
            }
        }
        automa::BrainKernel k2;
        for (auto& m : diff(k2.tick_behaviors(f.self, f.hostiles, f.profile, f.presentation, f.behaviors, wp), e)) {
            errs.push_back("[mask] " + m);
        }

        if (errs.empty()) {
            ++passed;
        } else {
            for (const auto& m : errs) std::printf("FAIL %s %s\n", f.id.c_str(), m.c_str());
        }
    }

    std::printf("C++: %zu/%zu passed\n", passed, fx.size());
    return passed == fx.size() ? 0 : 1;
}
