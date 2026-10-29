import base64
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
import cv2
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "perception"))
from satellite_camera import decode_frames
from scene import SceneWorker

class SatelliteCameraTests(unittest.TestCase):
    def test_jpeg_decodes_and_invalid_payloads_are_rejected(self):
        _, jpeg = cv2.imencode(".jpg", np.zeros((480,640,3),dtype=np.uint8))
        decoded = decode_frames([{"jpeg":base64.b64encode(jpeg).decode(), "capturedAt":123}])
        self.assertEqual(decoded[0][0].shape,(480,640,3))
        for images in ([], [{"jpeg":"not base64!","capturedAt":0}], [{"jpeg":base64.b64encode(b"fake").decode(),"capturedAt":0}]):
            with self.assertRaises((ValueError,TypeError)): decode_frames(images)

    def test_scene_worker_uses_satellite_image_instead_of_mirror(self):
        image=np.full((2,2,3),7,dtype=np.uint8)
        done=threading.Event()
        events=[]
        class Captioner:
            def load(self): pass
            def describe(self, frame, *args):
                if frame is not image: raise RuntimeError("wrong camera")
                return "image satellite"
        def emit(event):
            events.append(event)
            if event.get("type")=="vision_result": done.set()
        mirror=Mock(side_effect=AssertionError("mirror must not be read"))
        worker=SceneWorker(Captioner(),mirror,emit)
        worker.request("satellite", "tool", "Que vois-tu ?", image=(image,123))
        self.assertTrue(done.wait(2))
        worker.stop()
        mirror.assert_not_called()
        result=next(e for e in events if e.get("type")=="vision_result")
        self.assertEqual(result["status"],"ready")
        self.assertEqual(result["capturedAt"],123)

if __name__ == "__main__": unittest.main()
