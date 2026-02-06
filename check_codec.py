import cv2
import os


def check_codec(codec_name, filename):
    print(f"Testing codec: {codec_name}")
    fourcc = cv2.VideoWriter_fourcc(*codec_name)
    out = cv2.VideoWriter(filename, fourcc, 10.0, (640, 480))
    if out.isOpened():
        print(f"✅ Codec {codec_name} is supported.")
        out.release()
        os.remove(filename)
        return True
    else:
        print(f"❌ Codec {codec_name} is NOT supported.")
        return False


print("OpenCV Version:", cv2.__version__)
codecs = ["mp4v", "avc1", "h264", "H264", "XVID"]

supported = []
for c in codecs:
    if check_codec(c, f"test_{c}.mp4"):
        supported.append(c)

print(f"\nSupported codecs: {supported}")
