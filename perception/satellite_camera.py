"""One-shot satellite pictures. Description only; never stored on disk."""
import base64
import cv2
import numpy as np

MAX_JPEG = 80000

def decode_frames(images):
    if not isinstance(images, list) or not 1 <= len(images) <= 4:
        raise ValueError("Nombre d'images invalide.")
    decoded = []
    for image in images:
        raw = base64.b64decode(image["jpeg"], validate=True)
        if not 4 <= len(raw) <= MAX_JPEG or raw[:2] != b"\xff\xd8" or raw[-2:] != b"\xff\xd9":
            raise ValueError("JPEG invalide.")
        frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None or frame.shape[0] > 1200 or frame.shape[1] > 1600:
            raise ValueError("Dimensions de l'image invalides.")
        decoded.append((frame, image["capturedAt"]))
    return decoded