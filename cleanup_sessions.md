วิธีลบ Sessions ที่ไม่ได้ใช้ 🧹

ผมได้สร้างสคริปต์ cleanup_sessions.sh ให้แล้วครับ ตอนนี้มี 35 Sessions ทั้งหมด

📋 วิธีใช้งาน
1. ดูรายการ Sessions ทั้งหมด
bash
./cleanup_sessions.sh list
2. ลบ Session เฉพาะ ID
bash
./cleanup_sessions.sh delete 26    # ลบ Session #26
./cleanup_sessions.sh delete 27    # ลบ Session #27
3. เก็บเฉพาะ N Sessions ล่าสุด (แนะนำ)
bash
./cleanup_sessions.sh keep 5       # เก็บแค่ 5 Sessions ล่าสุด ลบที่เก่ากว่า
./cleanup_sessions.sh keep 10      # เก็บแค่ 10 Sessions ล่าสุด
4. ลบ Sessions เก่ากว่า N วัน
bash
./cleanup_sessions.sh old 7        # ลบ Sessions เก่ากว่า 7 วัน
./cleanup_sessions.sh old 1        # ลบ Sessions เก่ากว่า 1 วัน
5. ลบ Sessions ที่หยุดแล้ว
bash
./cleanup_sessions.sh stopped      # ลบทุก Session ที่มีสถานะ stopped/failed/completed
💡 คำแนะนำ
จากที่เห็นว่าท่านมี Sessions เก่าหลายตัว (Session #1-37) ที่เป็นการทดสอบ แนะนำให้:

ตัวเลือกที่ 1: เก็บเฉพาะ Session ล่าสุด

bash
./cleanup_sessions.sh keep 3
จะเก็บเฉพาะ Session #38, #34, #33 และลบที่เหลือทั้งหมด

ตัวเลือกที่ 2: ลบทีละตัว

bash
# ลบ Sessions #26-31 ที่เห็นในภาพ
for i in {26..31}; do ./cleanup_sessions.sh delete $i; done
หมายเหตุ: การลบ Session จะลบทั้ง:

ข้อมูล Session
Detections ที่เกี่ยวข้อง (CASCADE DELETE)
Performance Metrics