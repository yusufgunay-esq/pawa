// Stuntdouble conformance runner (C#). Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
// Replays every fixture through StuntBrainKernel and diffs against the TS reference decisions.
// Legacy-name scenarios run through BOTH Tick(AutonomyMode) and TickBehaviors(mask).
using System;
using System.Collections.Generic;
using Stuntdouble.Brain;

namespace Stuntdouble.Conformance
{
    public static class Program
    {
        private const double Tol = 1e-6;

        private static void Cmp(List<string> errs, string field, double got, double want)
        {
            if (Math.Abs(got - want) > Tol) errs.Add(field + ": got " + got.ToString("R") + " want " + want.ToString("R"));
        }

        private static void Cmp(List<string> errs, string field, string got, string want)
        {
            if (got != want) errs.Add(field + ": got " + (got ?? "null") + " want " + (want ?? "null"));
        }

        private static List<string> Diff(StuntDecision d, ExpectedDecision e)
        {
            var errs = new List<string>();
            Cmp(errs, "stance", d.Stance.ToString().ToUpperInvariant(), e.Stance);
            if (d.InterceptHumanInput != e.Intercept) errs.Add("interceptHumanInput: got " + d.InterceptHumanInput + " want " + e.Intercept);
            Cmp(errs, "selectedUtilityAction", d.SelectedUtilityAction, e.Utility);
            Cmp(errs, "utilityScore", d.UtilityScore, e.Score);
            Cmp(errs, "goapPlan", string.Join(">", d.GoapPlan), string.Join(">", e.Plan));
            Cmp(errs, "immediateCommand", d.ImmediateCommand, e.Command);
            Cmp(errs, "steering.x", d.SteeringDirection.X, e.Sx);
            Cmp(errs, "steering.z", d.SteeringDirection.Z, e.Sz);
            Cmp(errs, "speedMultiplier", d.SpeedMultiplier, e.Speed);
            Cmp(errs, "camera.mode", d.Camera.Mode, e.CamMode);
            Cmp(errs, "camera.timeScale", d.Camera.TimeScale, e.TimeScale);
            Cmp(errs, "camera.fovMultiplier", d.Camera.FovMultiplier, e.Fov);
            Cmp(errs, "camera.focusTargetId", d.Camera.FocusTargetId, e.Focus);
            return errs;
        }

        public static int Main()
        {
            ScenarioFixture[] fx = Fixtures.All;
            ExpectedDecision[] ex = Expected.All;
            if (fx.Length != ex.Length)
            {
                Console.WriteLine("FAIL: fixtures (" + fx.Length + ") and expected (" + ex.Length + ") differ in length");
                return 1;
            }

            int passed = 0;
            for (int i = 0; i < fx.Length; i++)
            {
                ScenarioFixture f = fx[i];
                ExpectedDecision e = ex[i];
                Vec3? wp = f.HasWaypoint ? (Vec3?)f.Waypoint : null;
                var errs = new List<string>();
                if (f.Id != e.Id) errs.Add("id mismatch: fixture " + f.Id + " vs expected " + e.Id);

                if (f.HasAutonomy)
                {
                    var k1 = new StuntBrainKernel();
                    foreach (string m in Diff(k1.Tick(f.Self, f.Hostiles, f.Profile, f.Presentation, f.Autonomy, wp), e)) errs.Add("[enum] " + m);
                }
                var k2 = new StuntBrainKernel();
                foreach (string m in Diff(k2.TickBehaviors(f.Self, f.Hostiles, f.Profile, f.Presentation, (Behaviors)f.Behaviors, wp), e)) errs.Add("[mask] " + m);

                if (errs.Count == 0) passed++;
                else foreach (string m in errs) Console.WriteLine("FAIL " + f.Id + " " + m);
            }

            Console.WriteLine("C#: " + passed + "/" + fx.Length + " passed");
            return passed == fx.Length ? 0 : 1;
        }
    }
}
