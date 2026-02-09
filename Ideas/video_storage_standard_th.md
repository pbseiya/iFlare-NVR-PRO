# มาตรฐานการจัดเก็บและปรับปรุงวิดีโอ (Video Storage & Optimization Standard)

เอกสารนี้สรุปแนวทางทางเทคนิคที่เราตกลงร่วมกัน เพื่อใช้ในการจัดการการบันทึก, การจัดเก็บ, และวงจรชีวิตของไฟล์วิดีโอในระบบ

## 1. กระบวนการบันทึก (Recording Workflow)

เพื่อความเสถียรของระบบและการเล่นไฟล์ที่ต่อเนื่อง (ไม่สะดุด):

1.  **การจับภาพ (Phase 1 - Capture):**
    *   บันทึก Stream ลงไฟล์ชั่วคราวแบบ **RAW** (เช่น `.m4v` หรือ `_raw.mp4`)
    *   **Codec:** ใช้ `mp4v` (MPEG-4) - กิน CPU น้อย เหมาะแก่การ capture สด
    *   **Database:** บันทึกข้อมูลพร้อมสถานะ `recording`

2.  **การแปลงไฟล์ (Phase 2 - Conversion):**
    *   เมื่อจบท่อนวิดีโอ (เช่น ครบ 1 นาที) ให้สั่ง `ffmpeg` แปลงไฟล์ทันที
    *   **คำสั่ง:** `ffmpeg -i input.m4v -c:v libx264 -preset fast -crf 23 -y output.mp4`
    *   **Database:** อัปเดตสถานะเป็น `processing`

3.  **ขั้นตอนสุดท้าย (Phase 3 - Finalization):**
    *   เมื่อแปลงสำเร็จ:
        *   อัปเดตสถานะใน Database เป็น `ready`
        *   อัปเดต `file_path` ให้ชี้ไปที่ไฟล์ `.mp4` ใหม่
        *   **ลบ** ไฟล์ RAW (`.m4v`) ทิ้งได้เลย
    *   **ความปลอดภัย:** ฝั่ง Frontend จะดึงและเล่นเฉพาะวิดีโอที่มีสถานะ `ready` เท่านั้น (ป้องกัน User เจอไฟล์เสีย)

## 2. โครงสร้างการจัดเก็บไฟล์ (File Storage Structure)

เพื่อป้องกันปัญหาเครื่องอืดเมื่อมีไฟล์หลักล้าน (Filesystem Performance):

**รูปแบบ:** `videos / YYYY / MM / DD / HH / camera_id / filename`

**ตัวอย่าง:**
`/home/pongsak/projects/yolov11_inference_cpu/videos/2026/02/09/16/cam_01/segment_16-01-00.mp4`

**ข้อดี:**
*   จำกัดจำนวนไฟล์ต่อ Folder (ประมาณ 60 ไฟล์/ชั่วโมง) ทำให้เข้าถึงข้อมูลได้เร็วมาก
*   ง่ายต่อการลบข้อมูลเก่า (Retention Cleanup) สามารถลบทั้ง Folder วัน/ชั่วโมง ทิ้งได้เลย

## 3. ระบบกู้คืนอัตโนมัติ (Self-Healing Recovery)

เพื่อจัดการกรณีกระบวนการล่ม หรือหยุดชะงักระหว่างแปลงไฟล์:

*   **ตวจสอบตอนเริ่มระบบ (Startup Check):** เมื่อ Server เริ่มทำงาน ให้ Scan หาไฟล์ที่มีสถานะ `processing` หรือ `recording` ที่ค้างอยู่ (ไม่มี Session ทำงานจริง)
*   **Action:** นำไฟล์เหล่านั้นเข้าคิวเพื่อแปลงใหม่ (Re-queue)
*   **Safety Net:** ไฟล์ RAW จะ **ไม่มีวันถูกลบ** จนกว่าจะยืนยันได้ว่าไฟล์ปลายทาง (`.mp4`) สมบูรณ์แล้ว

## 4. ความเข้ากันได้ของการเล่นไฟล์ (Playback Compatibility)

*   **Backend:** ให้บริการไฟล์ผ่าน API `/api/video/stream?path=...` ซึ่งรับ Absolute Path
*   **Frontend:** ร้องขอวิดีโอโดยใช้ Path เต็มที่เก็บใน Database
*   **ผลลัพธ์:** ไม่ต้องแก้ Code ส่วน Playback เลย เพราะระบบรองรับโครงสร้างแบบนี้อยู่แล้ว

## 5. นโยบายการลบข้อมูลเก่า (Retention Policy)

*   **การทำงาน:** ตั้ง Cron job หรือ Background Task ทำงานวันละครั้ง
*   **ตรรกะ:**
    1.  ค้นหา Database Records ที่เก่ากว่า `RETENTION_DAYS` (เช่น 30 วัน)
    2.  ลบไฟล์จริงออกจาก Disk
    3.  ลบ Folder ที่ว่างเปล่า (Empty Directory Cleanup)
    4.  ลบข้อมูลออกจาก Database
