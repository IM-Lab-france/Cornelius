import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "perception"))
from enrollment import Enrollment, FaceSample


class EnrollmentTests(unittest.TestCase):
    def setUp(self):
        self.enrollment = Enrollment({"id": "test"})
        self.feature = np.ones(128, dtype=np.float32) / np.sqrt(128)
        self.now = 0

    def capture(self, pose, feature=None, issue=None, enrollment=None, pitch=.55):
        self.now += .3
        target = enrollment or self.enrollment
        sample = FaceSample(self.feature if feature is None else feature, pose, issue, pitch=pitch)
        return target.add([sample], self.now)

    def test_requires_five_distinct_poses_and_preserves_each_view(self):
        for _ in range(6):
            self.assertIsNone(self.capture(0))
        self.assertEqual(self.enrollment.progress()["step"], 1)
        for _ in range(8):
            self.capture(0)  # Face-on frames cannot complete a side.
        self.assertEqual(len(self.enrollment.templates), 2)
        for _ in range(6):
            self.capture(.25)
        for _ in range(8):
            self.capture(.25)  # Same side cannot stand in for the opposite side.
        self.assertEqual(len(self.enrollment.templates), 4)
        for _ in range(6):
            self.assertIsNone(self.capture(-.25))
        self.assertEqual(self.enrollment.message, "Levez légèrement le menton.")
        for _ in range(4):
            self.capture(0, pitch=.57)  # Trop près de la position de face.
        self.assertEqual(len(self.enrollment.templates), 6)
        for _ in range(6):
            self.capture(0, pitch=.45)
        self.assertEqual(self.enrollment.message, "Baissez légèrement le menton.")
        for _ in range(8):
            self.capture(0, pitch=.45)  # Le même sens ne vaut pas pour l’autre.
        self.assertEqual(len(self.enrollment.templates), 8)
        for _ in range(6):
            result = self.capture(0, pitch=.66)
        self.assertEqual(len(result), 10)
        for vector in result:
            self.assertAlmostEqual(float(np.linalg.norm(vector)), 1, places=6)

    def test_vertical_steps_accept_either_order(self):
        for pose in (0, .25, -.25):
            for _ in range(6):
                self.capture(pose)
        for _ in range(6):
            self.capture(0, pitch=.7)  # La personne a baissé la tête en premier.
        self.assertEqual(self.enrollment.message, "Levez légèrement le menton.")
        for _ in range(6):
            result = self.capture(0, pitch=.45)
        self.assertEqual(len(result), 10)

    def test_turned_heads_do_not_count_as_up_or_down(self):
        for pose in (0, .25, -.25):
            for _ in range(6):
                self.capture(pose)
        for _ in range(6):
            self.capture(.4, pitch=.45)
        self.assertEqual(self.enrollment.stage, 3)

    def test_vertical_pose_accepts_slight_horizontal_offset(self):
        for pose in (0, .25, -.25):
            for _ in range(6):
                self.capture(pose)
        for _ in range(6):
            self.capture(.28, pitch=.45)
        self.assertEqual(self.enrollment.stage, 4)
        for _ in range(6):
            result = self.capture(-.28, pitch=.66)
        self.assertEqual(len(result), 10)

    def test_a_brief_wobble_does_not_restart_the_step(self):
        for pose in (0, .25, -.25):
            for _ in range(6):
                self.capture(pose)
        for _ in range(3):
            self.capture(0, pitch=.7)
        self.capture(0, pitch=.58)  # Un repère qui hésite une image.
        self.assertEqual(len(self.enrollment.samples), 3)
        for _ in range(3):
            self.capture(0, pitch=.58)  # Revenu de face trop longtemps : on recommence.
        self.assertEqual(len(self.enrollment.samples), 0)

    def test_tells_what_to_correct(self):
        for pose in (0, .25, -.25):
            for _ in range(6):
                self.capture(pose)
        self.capture(0, pitch=1.)
        self.assertEqual(self.enrollment.message, "Un peu moins : le mouvement doit rester léger.")
        self.capture(.4, pitch=.7)
        self.assertEqual(self.enrollment.message, "Gardez la tête droite, sans la tourner.")

    def test_samples_are_spaced_in_time(self):
        self.enrollment.add([FaceSample(self.feature, 0)], 0)
        self.enrollment.add([FaceSample(self.feature, 0)], .1)
        self.assertEqual(len(self.enrollment.samples), 1)
        self.enrollment.add([FaceSample(self.feature, 0)], .3)
        self.assertEqual(len(self.enrollment.samples), 2)

    def test_rejects_blur_multiple_faces_and_another_person(self):
        self.capture(0)
        self.capture(0, issue="Image floue")
        self.assertEqual(len(self.enrollment.samples), 0)
        self.capture(0)
        self.enrollment.add([], self.now)
        self.assertEqual(len(self.enrollment.samples), 0)
        for _ in range(6):
            self.capture(0)
        self.capture(.25, feature=-self.feature)
        self.assertEqual(len(self.enrollment.samples), 0)
        self.assertEqual(len(self.enrollment.templates), 2)
        self.assertIn("différent", self.enrollment.message)

    def test_lost_face_at_vertical_step_can_resume_without_losing_completed_views(self):
        for pose in (0, .25, -.25):
            for _ in range(6):
                self.capture(pose)
        self.capture(0, pitch=.45)
        self.enrollment.add([], self.now)
        self.assertIn("Visage non détecté", self.enrollment.message)
        self.assertEqual(self.enrollment.stage, 3)
        self.assertEqual(len(self.enrollment.templates), 6)
        self.assertEqual(len(self.enrollment.samples), 0)
        for _ in range(6):
            self.capture(0, pitch=.45)
        self.assertEqual(self.enrollment.stage, 4)

    def test_multiple_faces_still_block_enrollment(self):
        self.capture(0)
        sample = FaceSample(self.feature, 0)
        self.assertIsNone(self.enrollment.add([sample, sample], self.now))
        self.assertEqual(self.enrollment.message, "Placez une seule personne devant la caméra.")
        self.assertEqual(len(self.enrollment.samples), 0)
        self.assertEqual(self.enrollment.stage, 0)

    def test_vertical_pose_tolerates_brief_jitter_but_not_a_long_pause(self):
        for pose in (0, .25, -.25):
            for _ in range(6):
                self.capture(pose)
        for _ in range(5):
            self.capture(0, pitch=.45)
            self.capture(0, pitch=.55)
        self.assertEqual(len(self.enrollment.samples), 5)
        self.assertIn("Inclinez encore un peu", self.enrollment.message)
        self.now += 1
        self.capture(0, pitch=.55)
        self.assertEqual(len(self.enrollment.samples), 0)
        for _ in range(6):
            self.capture(0, pitch=.45)
        self.assertEqual(self.enrollment.stage, 4)

    def test_completing_a_face_rejects_someone_else(self):
        other = np.zeros(128, dtype=np.float32); other[0] = 1
        completing = Enrollment({"id": "add", "mode": "add"}, existing=[other.tolist()])
        self.capture(0, enrollment=completing)
        self.assertEqual(len(completing.samples), 0)
        self.assertIn("ne correspond pas", completing.message)
        same = Enrollment({"id": "add", "mode": "add"}, existing=[self.feature.tolist()])
        self.capture(0, enrollment=same)
        self.assertEqual(len(same.samples), 1)


if __name__ == "__main__":
    unittest.main()
