import re


def mask_rtsp_url(url: str) -> str:
    """
    Mask credentials in RTSP URLs.
    Example: rtsp://user:password123@192.168.1.50:554/stream
    becomes: rtsp://user:***@192.168.1.50:554/stream
    """
    if not url or not isinstance(url, str) or not url.startswith("rtsp://"):
        return url

    # regex for user:password@host
    # \1=rtsp://, \2=user, \3=password, \4=@
    return re.sub(r"(rtsp://)([^:]+):([^@]+)(@)", r"\1\2:***\4", url)
