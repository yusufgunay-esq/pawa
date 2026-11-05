// ============================================================================
// PAWA Core Brain Architecture for C++20 (Native DLL Proxy / MinHook / Anvil / Unreal)
// Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
// Header-only, zero-allocation 16-Slot Context Steering + Compensated Utility AI
// + Presentation Mode Director.
// ============================================================================

#pragma once
#include <cmath>
#include <algorithm>
#include <array>
#include <vector>
#include <string_view>

namespace pawa {

enum class PresentationMode : int {
    Tactical = 0,
    CinematicLive = 1,
    CinematicResolve = 2
};

enum class TacticalStance : int {
    Aggressive = 0,
    Balanced = 1,
    Defensive = 2,
    Evasive = 3,
    Stealth = 4
};

struct Vec3 {
    float x{0.f}, y{0.f}, z{0.f};

    [[nodiscard]] float dist_xz(const Vec3& o) const noexcept {
        const float dx = o.x - x;
        const float dz = o.z - z;
        return std::sqrt(dx * dx + dz * dz);
    }
};

struct PersonaProfile {
    float aggression{0.78f};
    float discipline{0.90f};
    float cinematic_flair{0.85f};
    float preferred_range{2.2f};
};

struct EntitySnapshot {
    int id{0};
    Vec3 position{};
    float health_ratio{1.0f};
    float stamina_ratio{1.0f};
    bool is_wind_up{false};
    float threat_weight{1.0f};
};

struct CameraDirective {
    std::string_view mode{"PASSIVE"};
    float time_scale{1.0f};
    float fov_multiplier{1.0f};
    int focus_target_id{-1};
};

struct Decision {
    TacticalStance stance{TacticalStance::Balanced};
    std::string_view immediate_command{"IDLE_SCAN"};
    float utility_score{0.0f};
    Vec3 steering_dir{};
    float speed_multiplier{1.0f};
    CameraDirective camera{};
};

class BrainKernel {
public:
    BrainKernel() noexcept {
        constexpr float kTwoPi = 6.28318530718f;
        for (int i = 0; i < 16; ++i) {
            const float a = (static_cast<float>(i) / 16.0f) * kTwoPi;
            dirs_[i] = Vec3{std::cos(a), 0.f, std::sin(a)};
        }
    }

    void cycle_presentation_mode() noexcept {
        active_mode_ = static_cast<PresentationMode>((static_cast<int>(active_mode_) + 1) % 3);
    }

    [[nodiscard]] PresentationMode presentation_mode() const noexcept { return active_mode_; }
    void set_presentation_mode(PresentationMode m) noexcept { active_mode_ = m; }

    template <std::size_t N>
    [[nodiscard]] static float compensated_utility(const std::array<float, N>& scores) noexcept {
        if constexpr (N == 0) return 0.f;
        const float mod_factor = 1.0f - (1.0f / static_cast<float>(N));
        float total = 1.0f;
        for (float raw : scores) {
            const float q = std::clamp(raw, 0.0f, 1.0f);
            const float makeup = (1.0f - q) * mod_factor;
            total *= (q + makeup * q);
            if (total <= 1e-6f) return 0.0f;
        }
        return total;
    }

    [[nodiscard]] Decision tick(
        const EntitySnapshot& self,
        const std::vector<EntitySnapshot>& hostiles,
        const PersonaProfile& persona
    ) const noexcept {
        const EntitySnapshot* primary = nullptr;
        const EntitySnapshot* wind_up = nullptr;
        float nearest_dist = 1e9f;

        for (const auto& h : hostiles) {
            if (h.health_ratio <= 0.f) continue;
            const float d = self.position.dist_xz(h.position);
            if (h.is_wind_up && d < 4.5f) wind_up = &h;
            if (d < nearest_dist) {
                nearest_dist = d;
                primary = &h;
            }
        }

        TacticalStance stance = TacticalStance::Balanced;
        if (!primary) stance = TacticalStance::Stealth;
        else if (self.health_ratio < 0.28f) stance = TacticalStance::Evasive;
        else if (wind_up) stance = TacticalStance::Defensive;
        else if (persona.aggression >= 0.65f && self.stamina_ratio > 0.35f) stance = TacticalStance::Aggressive;

        const float deflect_score = compensated_utility<2>({
            wind_up ? 1.0f : 0.0f,
            persona.cinematic_flair * 0.5f + 0.5f
        });

        const float finisher_score = primary
            ? compensated_utility<2>({
                std::clamp(1.0f - primary->health_ratio * 2.5f, 0.0f, 1.0f),
                std::clamp(1.0f - nearest_dist / 3.5f, 0.0f, 1.0f)
            })
            : 0.0f;

        const float strike_score = primary
            ? compensated_utility<2>({ self.stamina_ratio, persona.aggression })
            : 0.0f;

        std::string_view cmd = "IDLE_SCAN";
        float best_score = 0.0f;
        if (deflect_score >= finisher_score && deflect_score >= strike_score && deflect_score > 0.1f) {
            cmd = "DEFLECT_COUNTER";
            best_score = deflect_score;
        } else if (finisher_score >= strike_score && finisher_score > 0.45f) {
            cmd = "EXECUTE_FINISHER";
            best_score = finisher_score;
        } else if (primary) {
            cmd = (nearest_dist > persona.preferred_range * 1.25f) ? "CLOSE_DISTANCE" : "STRIKE_COMBO";
            best_score = strike_score;
        }

        float speed_mult = 1.0f;
        const Vec3 target_pos = primary ? primary->position : self.position;
        const Vec3 move_dir = compute_steering(self.position, target_pos, persona.preferred_range, hostiles, speed_mult);

        CameraDirective cam{"PASSIVE", 1.0f, 1.0f, primary ? primary->id : -1};
        if (active_mode_ == PresentationMode::CinematicResolve) {
            cam.mode = "FINISH_CUT";
            cam.time_scale = 1.75f;
            cam.fov_multiplier = 0.82f;
        } else if (active_mode_ == PresentationMode::CinematicLive) {
            if (cmd == "DEFLECT_COUNTER" || cmd == "EXECUTE_FINISHER") {
                cam.mode = "IMPACT_SLOWMO";
                cam.time_scale = 0.35f;
                cam.fov_multiplier = 0.85f;
            } else {
                cam.mode = "ACTION_TRACK";
                cam.time_scale = 1.0f;
                cam.fov_multiplier = 0.92f;
            }
        }

        return Decision{stance, cmd, best_score, move_dir, speed_mult, cam};
    }

private:
    std::array<Vec3, 16> dirs_{};
    PresentationMode active_mode_{PresentationMode::Tactical};

    [[nodiscard]] Vec3 compute_steering(
        const Vec3& self_pos,
        const Vec3& target_pos,
        float pref_dist,
        const std::vector<EntitySnapshot>& hostiles,
        float& out_speed_mult
    ) const noexcept {
        std::array<float, 16> interest{};
        std::array<float, 16> danger{};

        const float dx = target_pos.x - self_pos.x;
        const float dz = target_pos.z - self_pos.z;
        const float dist = std::sqrt(dx * dx + dz * dz);
        const float tx = dist > 1e-5f ? dx / dist : 0.f;
        const float tz = dist > 1e-5f ? dz / dist : 0.f;

        for (int i = 0; i < 16; ++i) {
            const float dot = dirs_[i].x * tx + dirs_[i].z * tz;
            if (dist > pref_dist * 1.15f) interest[i] = std::max(0.f, dot);
            else if (dist < pref_dist * 0.8f) interest[i] = std::max(0.f, -dot * 0.8f + (1.f - std::abs(dot)) * 0.5f);
            else interest[i] = 1.f - std::abs(dot);
        }

        for (const auto& h : hostiles) {
            if (h.health_ratio <= 0.f) continue;
            const float hx = h.position.x - self_pos.x;
            const float hz = h.position.z - self_pos.z;
            const float h_dist = std::sqrt(hx * hx + hz * hz);
            const float rad = h.is_wind_up ? 4.2f : 2.5f;
            if (h_dist >= rad || h_dist < 1e-5f) continue;

            const float nx = hx / h_dist;
            const float nz = hz / h_dist;
            const float urgency = (1.f - h_dist / rad) * h.threat_weight * (h.is_wind_up ? 1.8f : 1.0f);
            for (int i = 0; i < 16; ++i) {
                const float align = dirs_[i].x * nx + dirs_[i].z * nz;
                if (align > 0.f) {
                    danger[i] = std::max(danger[i], align * urgency);
                }
            }
        }

        int best_slot = 0;
        float best_score = -1e9f;
        for (int i = 0; i < 16; ++i) {
            const float s = interest[i] - danger[i] * 1.35f;
            if (s > best_score) {
                best_score = s;
                best_slot = i;
            }
        }

        out_speed_mult = std::clamp(best_score + 0.5f, 0.2f, 1.0f);
        return dirs_[best_slot];
    }
};

} // namespace pawa
