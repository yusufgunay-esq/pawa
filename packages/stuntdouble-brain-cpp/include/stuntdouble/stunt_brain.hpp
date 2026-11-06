// ============================================================================
// Stuntdouble Core Brain Architecture for C++20 (Native DLL proxy / MinHook / Anvil / Unreal)
// Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
//
// Header-only implementation of the full 4-Layer cognitive kernel:
//   Layer 4: Narrative & Tactical Orchestrator (5 AutonomyModes, stance, camera)
//   Layer 3B: Regressive A* GOAP Planner (boolean proposition domain)
//   Layer 3A: Makeup-Value Compensated Utility AI (+ deterministic epsilon-delta jitter)
//   Layer 2: Tactical Blackboard + 2D Spatial Influence Map
//   Layer 1: 16-Slot Context Steering (Interest - Danger synthesis)
//
// All simulation math is double, matching the TypeScript/C#/Lua kernels; float32
// rounding of profile parameters would silently break decision parity.
// Per-tick steering/utility buffers are fixed-size members (no heap traffic in the
// hot path); only the GOAP search pool allocates, and it reuses capacity across ticks.
//
// Verified decision-for-decision against the TypeScript reference by
// packages/conformance.
// ============================================================================

#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace stuntdouble {

// ============================================================================
// 0. CORE TYPES
// ============================================================================

enum class AutonomyMode : int {
    FullCombat = 0,
    CoPilot = 1,
    GrindAutopilot = 2,
    ShadowSurvival = 3,
    Commander = 4
};

/// Composable behavior flags. The five AutonomyMode names are presets over these.
/// Conflict rules: DEFENSIVE overrides offense; ASSIST is inert while COMBAT is set AND an enemy exists;
/// CRUISE runs only while no enemy exists; ASSIST+CRUISE: cruise when clear, human pass-through + reflex
/// intercept when an enemy exists; no active behavior => human input passes, Stuntdouble idle.
namespace behavior {
inline constexpr int Combat = 1;
inline constexpr int Assist = 2;
inline constexpr int Cruise = 4;
inline constexpr int Defensive = 8;
inline constexpr int Command = 16;
} // namespace behavior

[[nodiscard]] constexpr int behaviors_of(AutonomyMode m) noexcept {
    switch (m) {
        case AutonomyMode::CoPilot: return behavior::Assist;
        case AutonomyMode::GrindAutopilot: return behavior::Cruise | behavior::Combat;
        case AutonomyMode::ShadowSurvival: return behavior::Defensive;
        case AutonomyMode::Commander: return behavior::Combat | behavior::Command;
        default: return behavior::Combat;
    }
}

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

inline const char* to_string(TacticalStance s) noexcept {
    switch (s) {
        case TacticalStance::Aggressive: return "AGGRESSIVE";
        case TacticalStance::Balanced:   return "BALANCED";
        case TacticalStance::Defensive:  return "DEFENSIVE";
        case TacticalStance::Evasive:    return "EVASIVE";
        case TacticalStance::Stealth:    return "STEALTH";
    }
    return "BALANCED";
}

struct Vec3 {
    double x{0.0}, y{0.0}, z{0.0};

    /// XZ-plane distance (Y is ignored: Stuntdouble reasons on the horizontal plane).
    [[nodiscard]] double dist_xz(const Vec3& o) const noexcept {
        const double dx = o.x - x;
        const double dz = o.z - z;
        return std::sqrt(dx * dx + dz * dz);
    }
};

struct BehaviorProfile {
    double aggression{0.78};        // [0,1] offensive bias / gap closing
    double discipline{0.90};        // [0,1] inverse stochastic noise
    double cinematic_flair{0.85};   // [0,1] finishers, parries, camera drama
    int reaction_delay_ms{90};      // simulated motor latency
    double preferred_range{2.2};    // optimal engagement ring (meters)
};

struct EntitySnapshot {
    std::string id{};
    Vec3 position{};
    Vec3 velocity{};
    double health_ratio{1.0};
    double stamina_ratio{1.0};
    bool is_attacking{false};
    bool is_wind_up{false};   // telegraphing an incoming strike
    bool is_ranged{false};
    double threat_weight{1.0};
    double projectile_eta{0.0}; // seconds until a projectile this entity fired lands; <= 0 = none in flight
    double attack_range{0.0};   // [CORE-005] ranged: real firing range in meters; <= 0 = 16 m default
};

struct CameraDirective {
    std::string_view mode{"PASSIVE"};  // PASSIVE | ACTION_TRACK | IMPACT_SLOWMO | FINISH_CUT
    double time_scale{1.0};
    double fov_multiplier{1.0};
    const std::string* focus_target_id{nullptr};
};

struct Decision {
    AutonomyMode autonomy_mode{AutonomyMode::FullCombat}; // legacy name echo (FullCombat when ticked by mask)
    int behaviors{behavior::Combat};                      // resolved flag mask actually used
    TacticalStance stance{TacticalStance::Balanced};
    bool intercept_human_input{true};
    std::string_view selected_utility_action{"IDLE_SCAN"};
    double utility_score{0.0};
    std::vector<std::string_view> goap_plan{};
    std::string_view immediate_command{"IDLE_SCAN"};
    Vec3 steering_dir{};
    double speed_multiplier{1.0};
    CameraDirective camera{};
};

// ============================================================================
// SHARED MATH HELPERS (identical formulas in every Stuntdouble runtime)
// ============================================================================

namespace detail {

[[nodiscard]] inline double clamp01(double x) noexcept {
    if (x < 0.0) return 0.0;
    if (x > 1.0) return 1.0;
    return x;
}

/// floor(x * 10^digits + 0.5) / 10^digits — shared rounding across runtimes.
[[nodiscard]] inline double quantize(double value, int digits) noexcept {
    const double scale = std::pow(10.0, digits);
    return std::floor(value * scale + 0.5) / scale;
}

} // namespace detail

/// Boolean proposition domain used by the GOAP planner.
using WorldState = std::unordered_map<std::string, bool>;

// ============================================================================
// LAYER 1: 16-SLOT CONTEXT STEERING (Fray 2013 / Reynolds 1999)
// ============================================================================

struct Hazard {
    Vec3 position{};
    double radius{2.5};
    double weight{1.0};
};

class ContextSteering {
public:
    static constexpr int kSlots = 16;

    ContextSteering() noexcept {
        constexpr double kTwoPi = 6.283185307179586476925286766559;
        for (int i = 0; i < kSlots; ++i) {
            const double angle = (static_cast<double>(i) / static_cast<double>(kSlots)) * kTwoPi;
            dirs_[static_cast<std::size_t>(i)] = Vec3{std::cos(angle), 0.0, std::sin(angle)};
        }
    }

    [[nodiscard]] const Vec3& direction(int slot) const noexcept {
        return dirs_[static_cast<std::size_t>(slot)];
    }

    /// Conflict-free XZ movement: interest toward the preferred ring minus hazard cones.
    [[nodiscard]] Vec3 compute_move_vector(
        const Vec3& self_pos,
        const Vec3& target_pos,
        double preferred_distance,
        const std::vector<Hazard>& hazards,
        double& out_speed_multiplier) const noexcept
    {
        interest_.fill(0.0);
        danger_.fill(0.0);

        const double dx = target_pos.x - self_pos.x;
        const double dz = target_pos.z - self_pos.z;
        const double dist = std::sqrt(dx * dx + dz * dz);
        const double tx = dist > 1e-5 ? dx / dist : 0.0;
        const double tz = dist > 1e-5 ? dz / dist : 0.0;

        for (int i = 0; i < kSlots; ++i) {
            const auto& d = dirs_[static_cast<std::size_t>(i)];
            const double dot = d.x * tx + d.z * tz;
            if (dist > preferred_distance * 1.15) {
                interest_[static_cast<std::size_t>(i)] = std::max(0.0, dot);            // close the gap
            } else if (dist < preferred_distance * 0.8) {
                interest_[static_cast<std::size_t>(i)] =
                    std::max(0.0, -dot * 0.8 + (1.0 - std::abs(dot)) * 0.5);            // disengage / strafe out
            } else {
                interest_[static_cast<std::size_t>(i)] = 1.0 - std::abs(dot);            // strafe the ring
            }
        }

        for (const auto& h : hazards) {
            const double hx = h.position.x - self_pos.x;
            const double hz = h.position.z - self_pos.z;
            const double h_dist = std::sqrt(hx * hx + hz * hz);
            if (h_dist >= h.radius || h_dist < 1e-5) continue;

            const double nx = hx / h_dist;
            const double nz = hz / h_dist;
            const double proximity_urgency = (1.0 - h_dist / h.radius) * h.weight;

            for (int i = 0; i < kSlots; ++i) {
                const auto& d = dirs_[static_cast<std::size_t>(i)];
                const double alignment = d.x * nx + d.z * nz;
                if (alignment > 0.0) {
                    const double value = alignment * proximity_urgency;
                    auto& slot = danger_[static_cast<std::size_t>(i)];
                    if (value > slot) slot = value;
                }
            }
        }

        int best_slot = 0;
        double best_score = -1e308;
        for (int i = 0; i < kSlots; ++i) {
            const double score = interest_[static_cast<std::size_t>(i)] - danger_[static_cast<std::size_t>(i)] * 1.35;
            if (score > best_score) {
                best_score = score;
                best_slot = i;
            }
        }

        out_speed_multiplier = std::max(0.2, std::min(1.0, best_score + 0.5));
        return dirs_[static_cast<std::size_t>(best_slot)];
    }

private:
    std::array<Vec3, kSlots> dirs_{};
    mutable std::array<double, kSlots> interest_{};
    mutable std::array<double, kSlots> danger_{};
};

// ============================================================================
// LAYER 2: 2D SPATIAL INFLUENCE MAP + TACTICAL BLACKBOARD
// ============================================================================

class InfluenceMap2D {
public:
    explicit InfluenceMap2D(int grid_size = 16, double cell_size = 2.5)
        : grid_size_(grid_size), cell_size_(cell_size),
          grid_(static_cast<std::size_t>(grid_size) * static_cast<std::size_t>(grid_size), 0.0) {}

    [[nodiscard]] int grid_size() const noexcept { return grid_size_; }
    [[nodiscard]] double cell_size() const noexcept { return cell_size_; }

    void update(const Vec3& center,
                const std::vector<EntitySnapshot>& hostiles,
                const std::vector<EntitySnapshot>& allies = {}) noexcept
    {
        std::fill(grid_.begin(), grid_.end(), 0.0);
        const double half_span = (static_cast<double>(grid_size_) * cell_size_) / 2.0;

        for (int gx = 0; gx < grid_size_; ++gx) {
            for (int gz = 0; gz < grid_size_; ++gz) {
                const double world_x = center.x - half_span + (static_cast<double>(gx) + 0.5) * cell_size_;
                const double world_z = center.z - half_span + (static_cast<double>(gz) + 0.5) * cell_size_;

                double score = 0.0;
                for (const auto& h : hostiles) {
                    const double dx = world_x - h.position.x;
                    const double dz = world_z - h.position.z;
                    const double d = std::sqrt(dx * dx + dz * dz);
                    score -= (h.threat_weight * (h.is_wind_up ? 1.75 : 1.0)) / (1.0 + d * 0.45);
                }
                for (const auto& a : allies) {
                    const double dx = world_x - a.position.x;
                    const double dz = world_z - a.position.z;
                    const double d = std::sqrt(dx * dx + dz * dz);
                    score += a.threat_weight / (1.0 + d * 0.5);
                }
                grid_[index(gx, gz)] = score;
            }
        }
    }

    /// [CORE-005] Crowd positioning: best of 8 ring points (least threat, pulled towards the target).
    [[nodiscard]] Vec3 find_local_pocket(const Vec3& center, const std::vector<EntitySnapshot>& hostiles,
                                         const Vec3* target, double ring_radius) const noexcept {
        const double S = 0.7071067811865476;
        const double dxs[8] = {1.0, S, 0.0, -S, -1.0, -S, 0.0, S};
        const double dzs[8] = {0.0, S, 1.0, S, 0.0, -S, -1.0, -S};
        Vec3 best = center;
        double best_val = -1e308;
        for (int k = 0; k < 8; ++k) {
            const double px = center.x + dxs[k] * ring_radius;
            const double pz = center.z + dzs[k] * ring_radius;
            double score = 0.0;
            for (const auto& h : hostiles) {
                const double dx = px - h.position.x;
                const double dz = pz - h.position.z;
                const double d = std::sqrt(dx * dx + dz * dz);
                score -= (h.threat_weight * (h.is_wind_up ? 1.75 : 1.0)) / (1.0 + d * 0.45);
            }
            if (target != nullptr) {
                const double tx = px - target->x;
                const double tz = pz - target->z;
                const double td = std::sqrt(tx * tx + tz * tz);
                score -= 0.25 * std::max(0.0, td - 2.0);
            }
            if (score > best_val) {
                best_val = score;
                best = Vec3{px, center.y, pz};
            }
        }
        return best;
    }

    /// Highest scoring (safest) cell within the local grid.
    [[nodiscard]] Vec3 find_safest_pocket(const Vec3& center) const noexcept {
        const double half_span = (static_cast<double>(grid_size_) * cell_size_) / 2.0;
        std::size_t best_idx = 0;
        double best_val = -1e308;

        for (std::size_t i = 0; i < grid_.size(); ++i) {
            if (grid_[i] > best_val) {
                best_val = grid_[i];
                best_idx = i;
            }
        }

        const int gx = static_cast<int>(best_idx % static_cast<std::size_t>(grid_size_));
        const int gz = static_cast<int>(best_idx / static_cast<std::size_t>(grid_size_));
        return Vec3{center.x - half_span + (static_cast<double>(gx) + 0.5) * cell_size_,
                    center.y,
                    center.z - half_span + (static_cast<double>(gz) + 0.5) * cell_size_};
    }

private:
    [[nodiscard]] std::size_t index(int gx, int gz) const noexcept {
        return static_cast<std::size_t>(gz) * static_cast<std::size_t>(grid_size_) + static_cast<std::size_t>(gx);
    }

    int grid_size_;
    double cell_size_;
    std::vector<double> grid_;
};

class TacticalBlackboard {
public:
    EntitySnapshot self{};
    std::vector<EntitySnapshot> hostiles{};
    BehaviorProfile profile{};
    PresentationMode presentation_mode{PresentationMode::Tactical};
    TacticalStance stance{TacticalStance::Balanced};
    const EntitySnapshot* primary_target{nullptr};
    const EntitySnapshot* imminent_threat{nullptr};
    const EntitySnapshot* ranged_threat{nullptr}; // nearest ranged hostile winding up (<= 16 m) or with a projectile in flight
    double pressure_index{0.0};
    bool pressure_high{false}; // [CORE-005] crowd pressure with hysteresis (in above 0.72, out below 0.6)
    InfluenceMap2D influence_map{12, 2.5};

    void refresh(const EntitySnapshot& self_state,
                 const std::vector<EntitySnapshot>& hostiles_in,
                 const BehaviorProfile& profile_in)
    {
        self = self_state;
        profile = profile_in;
        hostiles.clear();
        hostiles.reserve(hostiles_in.size());
        for (const auto& h : hostiles_in) {
            if (h.health_ratio > 0.0) hostiles.push_back(h);
        }

        double nearest_dist = 1e308;
        const EntitySnapshot* best_target = nullptr;
        const EntitySnapshot* wind_up_threat = nullptr;
        const EntitySnapshot* ranged_threat_pick = nullptr;
        double ranged_dist = 1e308;
        double raw_pressure = 0.0;

        for (const auto& h : hostiles) {
            const double dx = h.position.x - self.position.x;
            const double dz = h.position.z - self.position.z;
            const double d = std::sqrt(dx * dx + dz * dz);

            raw_pressure += h.threat_weight / std::max(1.0, d * 0.35);

            if (h.is_wind_up && d < 4.5 && !h.is_ranged) wind_up_threat = &h;
            if (h.is_ranged && ((h.is_wind_up && d <= (h.attack_range > 0.0 ? h.attack_range : 16.0)) || h.projectile_eta > 0.0) && d < ranged_dist) {
                ranged_dist = d;
                ranged_threat_pick = &h;
            }
            const double key = h.is_ranged ? d * 0.5 : d;
            if (key < nearest_dist) {
                nearest_dist = key;
                best_target = &h;
            }
        }

        primary_target = best_target;
        imminent_threat = wind_up_threat;
        ranged_threat = ranged_threat_pick;
        pressure_index = std::min(1.0, raw_pressure / 3.5);
        if (pressure_high) {
            if (pressure_index < 0.6) pressure_high = false;
        } else if (pressure_index > 0.72) {
            pressure_high = true;
        }
        influence_map.update(self.position, hostiles);
    }

    [[nodiscard]] double target_distance() const noexcept {
        if (!primary_target) return 1e308;
        return self.position.dist_xz(primary_target->position);
    }

    [[nodiscard]] WorldState to_world_state() const {
        const bool has_target = primary_target != nullptr;
        const double dist = target_distance();
        const double preferred = profile.preferred_range;

        WorldState ws;
        ws["hasHostiles"] = !hostiles.empty();
        ws["inMeleeRange"] = dist <= 2.8;
        ws["inPreferredRange"] = dist <= preferred * 1.2;
        ws["underImminentAttack"] = imminent_threat != nullptr;
        ws["threatNeutralized"] = imminent_threat == nullptr;
        ws["healthCritical"] = self.health_ratio < 0.3;
        ws["staminaSufficient"] = self.stamina_ratio > 0.25;
        ws["targetVulnerable"] = has_target && primary_target->health_ratio < 0.25;
        ws["enemyEliminated"] = !has_target;
        ws["survived"] = self.health_ratio >= 0.65 && imminent_threat == nullptr;
        return ws;
    }
};

// ============================================================================
// LAYER 3A: RESPONSE CURVES, COMPENSATED UTILITY AI, DISCIPLINE JITTER
// ============================================================================

namespace curves {

[[nodiscard]] inline double linear(double x) noexcept { return detail::clamp01(x); }
[[nodiscard]] inline double inverse_linear(double x) noexcept { return detail::clamp01(1.0 - x); }

[[nodiscard]] inline double quadratic(double x, double k = 2.0) noexcept {
    return std::pow(detail::clamp01(x), k);
}

[[nodiscard]] inline double logistic(double x, double k = 10.0, double x0 = 0.5) noexcept {
    return 1.0 / (1.0 + std::exp(-k * (detail::clamp01(x) - x0)));
}

} // namespace curves

/// Deterministic epsilon-delta discipline jitter (WHITEPAPER §Layer 3A).
class DisciplineJitter {
public:
    static constexpr double kGoldenConjugate = 0.6180339887498949;

    void reset() noexcept { cursor_ = 0; }

    [[nodiscard]] double next(double discipline) noexcept {
        ++cursor_;
        const double scaled = static_cast<double>(cursor_) * kGoldenConjugate;
        const double u = scaled - std::floor(scaled);
        const double d = detail::clamp01(discipline);
        return ((1.0 - d) / 10.0) * (2.0 * u - 1.0);
    }

private:
    int cursor_{0};
};

struct TacticalBlackboard;

using ConsiderationFn = double (*)(const TacticalBlackboard&);
using CurveFn = double (*)(double);

struct Consideration {
    const char* name{""};
    ConsiderationFn evaluate{nullptr};
    CurveFn curve{nullptr};
};

class UtilityAction {
public:
    constexpr UtilityAction(const char* id, const Consideration* considerations, std::size_t count) noexcept
        : id_(id), considerations_(considerations), count_(count) {}

    [[nodiscard]] const char* id() const noexcept { return id_; }

    /// Dave Mark's Makeup Value compensated multiplicative score.
    [[nodiscard]] double score(const TacticalBlackboard& bb) const noexcept;

private:
    const char* id_;
    const Consideration* considerations_;
    std::size_t count_;
};

// ============================================================================
// LAYER 3B: REGRESSIVE A* GOAP PLANNER (Orkin 2006 / F.E.A.R.)
// ============================================================================

struct GoapAction {
    std::string name{};
    WorldState preconditions{};
    WorldState effects{};
    double base_cost{1.0};
    double (*dynamic_cost)(const TacticalBlackboard&){nullptr};
};

class GoapPlanner {
public:
    /// Backward regressive A* from the goal proposition set to the live world state.
    /// Returns false when no chain is reachable within the expansion budget.
    [[nodiscard]] bool plan(const WorldState& current_state,
                            const WorldState& goal_state,
                            const GoapAction* actions,
                            std::size_t action_count,
                            const TacticalBlackboard& bb,
                            std::vector<std::string_view>& out_plan)
    {
        out_plan.clear();
        open_.clear();
        closed_.clear();

        PlanNode root;
        root.unmet_goal = goal_state;
        root.g_cost = 0.0;
        root.f_cost = heuristic(current_state, goal_state);
        root.seq = seq_++;
        open_.push_back(std::move(root));

        int iterations = 0;
        constexpr int kMaxIterations = 256;

        while (!open_.empty() && iterations++ < kMaxIterations) {
            std::size_t best = 0;
            for (std::size_t i = 1; i < open_.size(); ++i) {
                if (less(open_[i], open_[best])) best = i;
            }
            PlanNode current = std::move(open_[best]);
            open_.erase(open_.begin() + static_cast<std::ptrdiff_t>(best));

            if (is_satisfied(current_state, current.unmet_goal)) {
                // current.actions holds the chain in reverse execution order.
                for (auto it = current.actions.rbegin(); it != current.actions.rend(); ++it) {
                    out_plan.push_back(*it);
                }
                return true;
            }

            if (!closed_.insert(serialize(current.unmet_goal)).second) continue;

            for (std::size_t a = 0; a < action_count; ++a) {
                const GoapAction& action = actions[a];
                if (!does_action_satisfy_any(action, current.unmet_goal, current_state)) continue;

                PlanNode next;
                next.unmet_goal = regress(current.unmet_goal, action);
                const double step_cost = action.dynamic_cost ? action.dynamic_cost(bb) : action.base_cost;
                next.g_cost = current.g_cost + std::max(0.05, step_cost);
                next.f_cost = next.g_cost + heuristic(current_state, next.unmet_goal);
                next.actions = current.actions;
                next.actions.push_back(action.name);
                next.seq = seq_++;
                open_.push_back(std::move(next));
            }
        }
        return false;
    }

private:
    struct PlanNode {
        WorldState unmet_goal{};
        std::vector<std::string_view> actions{};
        double g_cost{0.0};
        double f_cost{0.0};
        int seq{0};
    };

    static bool less(const PlanNode& a, const PlanNode& b) noexcept {
        if (a.f_cost != b.f_cost) return a.f_cost < b.f_cost;
        return a.seq < b.seq; // insertion order => deterministic tie-break
    }

    [[nodiscard]] static bool is_satisfied(const WorldState& current, const WorldState& required) {
        for (const auto& [key, value] : required) {
            const auto it = current.find(key);
            if (it == current.end() || it->second != value) return false;
        }
        return true;
    }

    [[nodiscard]] static bool does_action_satisfy_any(
        const GoapAction& action, const WorldState& unmet_goal, const WorldState& current_state)
    {
        bool helps = false;
        for (const auto& [key, value] : action.effects) {
            const auto goal_it = unmet_goal.find(key);
            if (goal_it == unmet_goal.end()) continue;

            const auto cur = current_state.find(key);
            const bool is_now = cur != current_state.end() && cur->second == goal_it->second;

            if (goal_it->second == value && !is_now) {
                helps = true;
            } else if (goal_it->second != value) {
                return false;
            }
        }
        return helps;
    }

    [[nodiscard]] static WorldState regress(const WorldState& unmet_goal, const GoapAction& action) {
        WorldState next = unmet_goal;
        for (const auto& [key, value] : action.effects) next.erase(key);
        for (const auto& [key, value] : action.preconditions) next[key] = value;
        return next;
    }

    [[nodiscard]] static double heuristic(const WorldState& current, const WorldState& required) {
        int diff = 0;
        for (const auto& [key, value] : required) {
            const auto it = current.find(key);
            if (it == current.end() || it->second != value) ++diff;
        }
        return static_cast<double>(diff) * 0.5;
    }

    /// Keys sorted lexicographically so the closed-set identity is runtime-independent.
    [[nodiscard]] static std::string serialize(const WorldState& state) {
        std::vector<std::pair<std::string_view, bool>> entries;
        entries.reserve(state.size());
        for (const auto& [key, value] : state) entries.emplace_back(key, value);
        std::sort(entries.begin(), entries.end(),
                  [](const auto& a, const auto& b) { return a.first < b.first; });

        std::string out;
        for (std::size_t i = 0; i < entries.size(); ++i) {
            if (i) out.push_back('|');
            out.append(entries[i].first);
            out.push_back(':');
            out.append(entries[i].second ? "true" : "false");
        }
        return out;
    }

    std::vector<PlanNode> open_{};
    std::unordered_set<std::string> closed_{};
    int seq_{0};
};

// ============================================================================
// DEFAULT ACTION TABLES
// ============================================================================

namespace defaults {

double eval_imminent_strike(const TacticalBlackboard& bb);
double eval_protagonist_flair(const TacticalBlackboard& bb);
double eval_target_near_death(const TacticalBlackboard& bb);
double eval_close_proximity(const TacticalBlackboard& bb);
double eval_low_health(const TacticalBlackboard& bb);
double eval_pressure(const TacticalBlackboard& bb);
double eval_stamina(const TacticalBlackboard& bb);
double eval_aggression(const TacticalBlackboard& bb);

double curve_logistic_default(double x);
double curve_quadratic_default(double x);
double curve_logistic_evade(double x);

[[nodiscard]] inline const Consideration* utility_considerations(std::size_t& total) {
    static const Consideration table[] = {
        {"ImminentStrike", &eval_imminent_strike, &curves::linear},
        {"ProtagonistFlair", &eval_protagonist_flair, &curves::linear},
        {"TargetNearDeath", &eval_target_near_death, &curve_logistic_default},
        {"CloseProximity", &eval_close_proximity, &curve_quadratic_default},
        {"LowHealthUrgency", &eval_low_health, &curve_logistic_evade},
        {"HighCrowdPressure", &eval_pressure, &curves::linear},
        {"StaminaAvailable", &eval_stamina, &curves::linear},
        {"AggressionDrive", &eval_aggression, &curves::linear},
    };
    total = sizeof(table) / sizeof(table[0]);
    return table;
}

[[nodiscard]] inline std::vector<UtilityAction>& utility_actions() {
    static std::vector<UtilityAction> table = [] {
        std::size_t total = 0;
        const Consideration* c = utility_considerations(total);
        (void)total;
        return std::vector<UtilityAction>{
            UtilityAction{"DEFLECT_COUNTER", c + 0, 2},
            UtilityAction{"EXECUTE_FINISHER", c + 2, 2},
            UtilityAction{"EVADE_REPOSITION", c + 4, 2},
            UtilityAction{"STRIKE_COMBO", c + 6, 2},
        };
    }();
    return table;
}

[[nodiscard]] inline std::vector<GoapAction>& goap_actions() {
    static std::vector<GoapAction> table = [] {
        auto make = [](const char* name,
                       std::initializer_list<std::pair<const char*, bool>> pre,
                       std::initializer_list<std::pair<const char*, bool>> eff,
                       double cost) {
            GoapAction a;
            a.name = name;
            for (const auto& [k, v] : pre) a.preconditions[k] = v;
            for (const auto& [k, v] : eff) a.effects[k] = v;
            a.base_cost = cost;
            return a;
        };

        return std::vector<GoapAction>{
            make("CLOSE_DISTANCE",
                 {{"hasHostiles", true}},
                 {{"inMeleeRange", true}, {"inPreferredRange", true}},
                 1.0),
            make("DEFLECT_COUNTER",
                 {{"underImminentAttack", true}},
                 {{"underImminentAttack", false}, {"threatNeutralized", true}, {"targetVulnerable", true}},
                 0.6),
            make("HEAVY_ASSAULT",
                 {{"inMeleeRange", true}, {"staminaSufficient", true}},
                 {{"targetVulnerable", true}},
                 1.1),
            make("EXECUTE_FINISHER",
                 {{"inMeleeRange", true}, {"targetVulnerable", true}},
                 {{"enemyEliminated", true}, {"threatNeutralized", true}},
                 0.4),
            make("TACTICAL_HEAL",
                 {{"healthCritical", true}},
                 {{"healthCritical", false}, {"survived", true}},
                 0.8),
            make("EVADE_TO_COVER",
                 {{"underImminentAttack", true}},
                 {{"underImminentAttack", false}, {"survived", true}, {"threatNeutralized", true}},
                 0.9),
        };
    }();
    return table;
}

} // namespace defaults

// ============================================================================
// LAYER 4: ORCHESTRATOR + UNIFIED KERNEL
// ============================================================================

class BrainKernel {
public:
    BrainKernel() = default;

    [[nodiscard]] PresentationMode presentation_mode() const noexcept { return active_presentation_; }
    void set_presentation_mode(PresentationMode m) noexcept { active_presentation_ = m; }
    void cycle_presentation_mode() noexcept {
        active_presentation_ = static_cast<PresentationMode>((static_cast<int>(active_presentation_) + 1) % 3);
    }

    [[nodiscard]] AutonomyMode autonomy_mode() const noexcept { return active_autonomy_; }
    void set_autonomy_mode(AutonomyMode m) noexcept { active_autonomy_ = m; }
    void cycle_autonomy_mode() noexcept {
        active_autonomy_ = static_cast<AutonomyMode>((static_cast<int>(active_autonomy_) + 1) % 5);
    }

    [[nodiscard]] const TacticalBlackboard& blackboard() const noexcept { return blackboard_; }

    [[nodiscard]] Decision tick(const EntitySnapshot& self,
                                const std::vector<EntitySnapshot>& hostiles,
                                const BehaviorProfile& profile,
                                PresentationMode presentation = PresentationMode::Tactical,
                                AutonomyMode autonomy = AutonomyMode::FullCombat,
                                const Vec3* waypoint_or_loot = nullptr)
    {
        Decision d = tick_behaviors(self, hostiles, profile, presentation, behaviors_of(autonomy), waypoint_or_loot);
        d.autonomy_mode = autonomy;
        return d;
    }

    [[nodiscard]] Decision tick_behaviors(const EntitySnapshot& self,
                                          const std::vector<EntitySnapshot>& hostiles,
                                          const BehaviorProfile& profile,
                                          PresentationMode presentation,
                                          int behaviors,
                                          const Vec3* waypoint_or_loot = nullptr)
    {
        // 1. Layer 2 — blackboard + influence map
        blackboard_.presentation_mode = presentation;
        blackboard_.refresh(self, hostiles, profile);

        // [FLAGS] resolve behaviors (identical block in every port)
        const bool has_enemy = !blackboard_.hostiles.empty();
        const bool f_combat = (behaviors & behavior::Combat) != 0;
        const bool f_defensive = (behaviors & behavior::Defensive) != 0;
        const bool assist_active = (behaviors & behavior::Assist) != 0 && !(f_combat && has_enemy);
        const bool cruise_active = (behaviors & behavior::Cruise) != 0 && !has_enemy;
        const bool inactive = !(f_combat || f_defensive || assist_active || cruise_active);

        // 2. Layer 4 — stance & high-level goal
        const TacticalStance stance = f_defensive ? TacticalStance::Defensive : evaluate_stance();
        blackboard_.stance = stance;
        const WorldState goal_state = select_goal_for_stance(stance);

        // 3. Layer 3A — compensated utility + deterministic jitter
        std::size_t best_index = 0;
        double best_score = -1.0;
        jitter_.reset();
        for (std::size_t i = 0; i < utility_actions_.size(); ++i) {
            const UtilityAction& ua = utility_actions_[i];
            const std::string_view id{ua.id()};
            if (f_defensive &&
                (id == "STRIKE_COMBO" || id == "EXECUTE_FINISHER")) {
                continue; // DEFENSIVE never attacks
            }
            const double jittered = ua.score(blackboard_) + jitter_.next(profile.discipline);
            const double s = detail::clamp01(jittered);
            if (s > best_score) {
                best_score = s;
                best_index = i;
            }
        }
        const std::string_view best_id{utility_actions_[best_index].id()};

        // 4. Layer 3B — regressive A* plan
        const WorldState world_state = blackboard_.to_world_state();
        static_cast<void>(planner_.plan(world_state, goal_state, goap_actions_.data(), goap_actions_.size(), blackboard_, plan_));

        // Autonomy-mode command & human-input interception policy
        std::string_view immediate_command =
            best_score > 0.78 + 0.4 * (0.78 - profile.aggression) ? best_id : (!plan_.empty() ? plan_.front() : best_id);
        bool intercept_human_input = true;

        if (inactive) {
            // [FLAGS] no active behavior: human input passes, Stuntdouble does nothing
            intercept_human_input = false;
            immediate_command = "HUMAN_PASS_THROUGH";
        } else if (cruise_active) {
            immediate_command = waypoint_or_loot ? "CRUISE_OR_LOOT" : "IDLE_SCAN";
        } else if (assist_active) {
            const bool is_urgent_reflex =
                (best_id == "DEFLECT_COUNTER" || best_id == "EVADE_REPOSITION") && best_score >= 0.75;
            intercept_human_input = is_urgent_reflex || self.health_ratio < 0.25;
            if (!intercept_human_input) immediate_command = "HUMAN_PASS_THROUGH";
        }

        // [CORE-005] crowd: fight from the least-covered side, punish in the gaps
        const bool crowd = !inactive && !cruise_active && !assist_active && !f_defensive &&
                           stance == TacticalStance::Defensive && blackboard_.pressure_high;
        const EntitySnapshot* counter_target = nullptr;
        if (crowd && blackboard_.imminent_threat == nullptr && self.health_ratio >= 0.4 &&
            immediate_command != "TACTICAL_HEAL") {
            double cd = 1e308;
            for (const auto& h : blackboard_.hostiles) {
                if (h.is_ranged) continue;
                const double hx = h.position.x - self.position.x;
                const double hz = h.position.z - self.position.z;
                const double d = std::sqrt(hx * hx + hz * hz);
                if (d <= 2.6 && d < cd) { cd = d; counter_target = &h; }
            }
            if (counter_target != nullptr && immediate_command != "STRIKE_COMBO" &&
                immediate_command != "HEAVY_ASSAULT" && immediate_command != "EXECUTE_FINISHER") {
                immediate_command = "STRIKE_COMBO";
            }
        }

        // [CORE-003] continuous aggression: stamina reserve = (1 - aggression) * 0.6
        if (!inactive && !cruise_active && !assist_active && blackboard_.imminent_threat == nullptr &&
            (immediate_command == "STRIKE_COMBO" || immediate_command == "HEAVY_ASSAULT") &&
            self.stamina_ratio < (1.0 - profile.aggression) * 0.9) {
            immediate_command = "CLOSE_DISTANCE";
        }

        // [CORE-005] aggression pacing: a share `aggression` of strike requests goes out (credit accumulator)
        if (!inactive && !cruise_active && !assist_active && blackboard_.imminent_threat == nullptr &&
            (immediate_command == "STRIKE_COMBO" || immediate_command == "HEAVY_ASSAULT")) {
            attack_budget_ += profile.aggression;
            if (attack_budget_ >= 1.0) attack_budget_ -= 1.0;
            else immediate_command = "CLOSE_DISTANCE";
        }

        // [CORE-003] critical health and nothing about to land in melee: heal beats fleeing
        if (!inactive && !cruise_active && !assist_active && blackboard_.imminent_threat == nullptr &&
            self.health_ratio < 0.3 && !plan_.empty() && plan_.front() == "TACTICAL_HEAL") {
            immediate_command = "TACTICAL_HEAL";
        }

        // [CORE-003] ranged threat: lateral sidestep, dodge timed to the projectile (impact within 0.4 s)
        const EntitySnapshot* rt = blackboard_.ranged_threat;
        const bool ranged_reflex = !inactive && rt != nullptr && blackboard_.imminent_threat == nullptr &&
                                   immediate_command != "TACTICAL_HEAL";
        if (ranged_reflex) {
            const double eta = rt->projectile_eta;
            const bool dodge_now = eta > 0.0 && eta <= 0.4;
            if (dodge_now) immediate_command = "EVADE_REPOSITION";
            if (dodge_now || !assist_active) intercept_human_input = true;
        }

        // 5. Layer 1 — context steering synthesis
        Vec3 nav_target = self.position;
        if (cruise_active && waypoint_or_loot) {
            nav_target = *waypoint_or_loot;
        } else if (crowd) {
            const EntitySnapshot* focus = counter_target != nullptr ? counter_target : blackboard_.primary_target;
            Vec3 focus_pos{};
            if (focus != nullptr) focus_pos = focus->position;
            nav_target = blackboard_.influence_map.find_local_pocket(self.position, blackboard_.hostiles,
                                                                     focus != nullptr ? &focus_pos : nullptr, 2.5);
        } else if (stance == TacticalStance::Evasive || stance == TacticalStance::Defensive) {
            nav_target = blackboard_.influence_map.find_safest_pocket(self.position);
        } else if (blackboard_.primary_target) {
            nav_target = blackboard_.primary_target->position;
        }

        hazards_.clear();
        hazards_.reserve(blackboard_.hostiles.size());
        for (const auto& h : blackboard_.hostiles) {
            hazards_.push_back(Hazard{h.position,
                                      h.is_wind_up ? 4.2 : 2.5,
                                      h.threat_weight * (h.is_wind_up ? 1.8 : 1.0)});
        }

        const double pref_range = (cruise_active || crowd) ? 0.5 : profile.preferred_range;

        double speed_multiplier = 1.0;
        Vec3 direction = steering_.compute_move_vector(
            self.position, nav_target, pref_range, hazards_, speed_multiplier);
        if (inactive) {
            // [FLAGS] idle: no steering output
            direction = Vec3{0.0, 0.0, 0.0};
            speed_multiplier = 0.0;
        } else if (ranged_reflex) {
            double ux = rt->position.x - self.position.x;
            double uz = rt->position.z - self.position.z;
            const double ul = std::sqrt(ux * ux + uz * uz);
            if (ul > 1e-6) { ux /= ul; uz /= ul; } else { ux = 0.0; uz = 0.0; }
            const double lx = -uz;
            const double lz = ux;
            const double side = (self.velocity.x * lx + self.velocity.z * lz >= 0.0) ? 1.0 : -1.0;
            double mx = side * lx + (1.0 + profile.aggression * 0.6) * ux;
            double mz = side * lz + (1.0 + profile.aggression * 0.6) * uz;
            const double ml = std::sqrt(mx * mx + mz * mz);
            if (ml > 1e-9) { mx /= ml; mz /= ml; } else { mx = 0.0; mz = 0.0; }
            direction = Vec3{mx, 0.0, mz};
            speed_multiplier = 1.0;
        }

        // 6. Layer 4 — presentation director
        CameraDirective camera = compute_camera_directive(presentation, immediate_command, profile);
        if (blackboard_.primary_target) {
            focus_id_ = blackboard_.primary_target->id;
            camera.focus_target_id = &focus_id_;
        } else {
            focus_id_.clear();
            camera.focus_target_id = nullptr;
        }

        Decision decision;
        decision.autonomy_mode = AutonomyMode::FullCombat;
        decision.behaviors = behaviors;
        decision.stance = stance;
        decision.intercept_human_input = intercept_human_input;
        decision.selected_utility_action = best_id;
        decision.utility_score = detail::quantize(best_score, 4);
        decision.goap_plan = plan_;
        decision.immediate_command = immediate_command;
        decision.steering_dir = direction;
        decision.speed_multiplier = detail::quantize(speed_multiplier, 3);
        decision.camera = camera;
        return decision;
    }

private:
    [[nodiscard]] TacticalStance evaluate_stance() const noexcept {
        const auto& bb = blackboard_;
        if (bb.hostiles.empty()) return TacticalStance::Stealth;
        if (bb.self.health_ratio < 0.28) return TacticalStance::Evasive;
        if (bb.imminent_threat || bb.pressure_high) return TacticalStance::Defensive;
        if (bb.profile.aggression >= 0.65 && bb.self.stamina_ratio > 0.35) return TacticalStance::Aggressive;
        return TacticalStance::Balanced;
    }

    [[nodiscard]] static WorldState select_goal_for_stance(TacticalStance stance) {
        WorldState goal;
        switch (stance) {
            case TacticalStance::Evasive:
                goal["survived"] = true;
                break;
            case TacticalStance::Defensive:
            case TacticalStance::Stealth:
                goal["threatNeutralized"] = true;
                break;
            case TacticalStance::Aggressive:
            case TacticalStance::Balanced:
                goal["enemyEliminated"] = true;
                break;
        }
        return goal;
    }

    [[nodiscard]] CameraDirective compute_camera_directive(PresentationMode mode,
                                                           std::string_view command,
                                                           const BehaviorProfile& profile) const noexcept {
        const std::string* target_id = blackboard_.primary_target ? &blackboard_.primary_target->id : nullptr;

        if (mode == PresentationMode::Tactical) {
            return CameraDirective{"PASSIVE", 1.0, 1.0, target_id};
        }
        if (mode == PresentationMode::CinematicResolve) {
            return CameraDirective{"FINISH_CUT", 1.75, 0.82, target_id};
        }
        if (command == "EXECUTE_FINISHER" || command == "DEFLECT_COUNTER") {
            return CameraDirective{"IMPACT_SLOWMO", profile.cinematic_flair > 0.5 ? 0.35 : 0.65, 0.85, target_id};
        }
        return CameraDirective{"ACTION_TRACK", 1.0, 0.92, target_id};
    }

    TacticalBlackboard blackboard_{};
    ContextSteering steering_{};
    GoapPlanner planner_{};
    DisciplineJitter jitter_{};
    double attack_budget_{1.0}; // [CORE-005] aggression pacing credit (first strike always goes out)

    std::vector<UtilityAction> utility_actions_{defaults::utility_actions()};
    std::vector<GoapAction> goap_actions_{defaults::goap_actions()};

    std::vector<std::string_view> plan_{};
    std::vector<Hazard> hazards_{};
    std::string focus_id_{};
    PresentationMode active_presentation_{PresentationMode::Tactical};
    AutonomyMode active_autonomy_{AutonomyMode::FullCombat};
};

// ============================================================================
// OUT-OF-LINE DEFINITIONS
// ============================================================================

inline double UtilityAction::score(const TacticalBlackboard& bb) const noexcept {
    if (count_ == 0) return 0.0;

    const double n = static_cast<double>(count_);
    const double modification_factor = 1.0 - 1.0 / n;
    double running = 1.0;

    for (std::size_t i = 0; i < count_; ++i) {
        const auto& c = considerations_[i];
        const double raw = detail::clamp01(c.evaluate(bb));
        const double q = detail::clamp01(c.curve(raw));
        const double make_up = (1.0 - q) * modification_factor;
        running *= q + make_up * q;
        if (running <= 1e-6) return 0.0;
    }
    return running;
}

namespace defaults {

inline double eval_imminent_strike(const TacticalBlackboard& bb) {
    return bb.imminent_threat ? 1.0 : 0.0;
}
inline double eval_protagonist_flair(const TacticalBlackboard& bb) {
    return bb.profile.cinematic_flair * 0.5 + 0.5;
}
inline double eval_target_near_death(const TacticalBlackboard& bb) {
    return bb.primary_target ? 1.0 - bb.primary_target->health_ratio : 0.0;
}
inline double eval_close_proximity(const TacticalBlackboard& bb) {
    if (!bb.primary_target) return 0.0;
    return std::max(0.0, 1.0 - bb.target_distance() / 3.5);
}
inline double eval_low_health(const TacticalBlackboard& bb) { return 1.0 - bb.self.health_ratio; }
inline double eval_pressure(const TacticalBlackboard& bb) { return bb.pressure_index; }
inline double eval_stamina(const TacticalBlackboard& bb) { return bb.self.stamina_ratio; }
inline double eval_aggression(const TacticalBlackboard& bb) { return bb.profile.aggression; }

inline double curve_logistic_default(double x) { return curves::logistic(x); }
inline double curve_quadratic_default(double x) { return curves::quadratic(x); }
inline double curve_logistic_evade(double x) { return curves::logistic(x, 12.0, 0.65); }

} // namespace defaults

} // namespace stuntdouble
