"""
Face + landmark detector for the celebrity image pipeline.

Reads a JSON object from stdin:
    { "model": "path/to/face_detection_yunet_2023mar.onnx",
      "files": ["a.jpg", "b.png"] }

Writes a JSON array to stdout, one entry per input file. Each entry has the
image dimensions and every detected face, sorted largest first, including the
five YuNet landmarks (right eye, left eye, nose tip, mouth right, mouth left).

This runs only at build time. The mobile game ships the pre-cropped images and
never needs OpenCV.
"""
import json
import sys

import cv2


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception as exc:  # noqa: BLE001 - report cleanly to the caller
        print(f"could not read request: {exc}", file=sys.stderr)
        return 2

    model = payload.get("model")
    files = payload.get("files") or []

    if not model:
        print("model path is required", file=sys.stderr)
        return 2

    try:
        # 0.65 rather than 0.5: YuNet's low-confidence boxes are frequently
        # faces printed on posters, hands or furniture in the background. A
        # real portrait almost always clears 0.75.
        detector = cv2.FaceDetectorYN.create(model, "", (320, 320), 0.65, 0.3, 5000)
    except Exception as exc:  # noqa: BLE001
        print(f"could not load face model: {exc}", file=sys.stderr)
        return 2

    # Keep the build predictable on a laptop that is doing other things.
    cv2.setNumThreads(2)

    results = []

    for path in files:
        image = cv2.imread(path)
        if image is None:
            results.append({"file": path, "error": "unreadable", "faces": []})
            continue

        height, width = image.shape[:2]
        scale = 1.0

        # Large originals are not needed at full resolution for a face box.
        # Downscale and scale the coordinates back, which is much faster.
        if max(width, height) > 2400:
            scale = 2400.0 / float(max(width, height))
            image = cv2.resize(
                image,
                (max(1, int(round(width * scale))), max(1, int(round(height * scale)))),
                interpolation=cv2.INTER_AREA,
            )

        resized_h, resized_w = image.shape[:2]
        detector.setInputSize((resized_w, resized_h))

        try:
            _, detected = detector.detect(image)
        except Exception as exc:  # noqa: BLE001
            results.append({"file": path, "error": str(exc), "faces": []})
            continue

        faces = []
        if detected is not None:
            for raw in detected:
                vals = [float(value) for value in raw[:14]]
                score = float(raw[-1])
                inv = 1.0 / scale

                x, y, w, h = vals[0] * inv, vals[1] * inv, vals[2] * inv, vals[3] * inv
                right_eye_x, right_eye_y = vals[4] * inv, vals[5] * inv
                left_eye_x, left_eye_y = vals[6] * inv, vals[7] * inv
                nose_x, nose_y = vals[8] * inv, vals[9] * inv
                mouth_right_x, mouth_right_y = vals[10] * inv, vals[11] * inv
                mouth_left_x, mouth_left_y = vals[12] * inv, vals[13] * inv

                faces.append(
                    {
                        "score": score,
                        "box": {"x": x, "y": y, "w": w, "h": h},
                        "landmarks": {
                            "rightEye": {"x": right_eye_x, "y": right_eye_y},
                            "leftEye": {"x": left_eye_x, "y": left_eye_y},
                            "nose": {"x": nose_x, "y": nose_y},
                            "mouthRight": {"x": mouth_right_x, "y": mouth_right_y},
                            "mouthLeft": {"x": mouth_left_x, "y": mouth_left_y},
                        },
                    }
                )

        # Confidence first, area second. Sorting by area alone lets a huge
        # low-confidence false positive (a hand, a poster, a reflection) beat
        # the actual face in the frame.
        faces.sort(key=lambda face: (round(face["score"], 2), face["box"]["w"] * face["box"]["h"]), reverse=True)
        results.append(
            {
                "file": path,
                "width": width,
                "height": height,
                "faces": faces,
            }
        )

    json.dump(results, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
