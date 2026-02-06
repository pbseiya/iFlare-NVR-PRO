import cv2
import os


def check_codec(codec_name, filename):
    print(f"Testing codec: {codec_name}")
    try:
        fourcc = cv2.VideoWriter_fourcc(*codec_name)
        out = cv2.VideoWriter(filename, fourcc, 10.0, (640, 480))
        if out.isOpened():
            print(f"✅ Codec {codec_name} is supported.")
            out.release()
            os.remove(filename)
            return True
        else:
            print(f"❌ Codec {codec_name} is NOT supported (writer failed to open).")
            return False
    except Exception as e:
        print(f"❌ Codec {codec_name} raised error: {e}")
        return False


print("OpenCV Version:", cv2.__version__)
# VP9 fourcc codes can vary: 'VP90', 'vp09'
codecs = ["VP90", "vp09"]

supported = []
for c in codecs:
    if check_codec(c, f"test_{c}.webm"):  # VP9 usually uses .webm or .mkv
        supported.append(c)

print(f"\nSupported VP9 variants: {supported}")
