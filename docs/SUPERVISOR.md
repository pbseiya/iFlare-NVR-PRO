# Supervisor Process Manager - คู่มือการใช้งาน

## ภาพรวม

**Supervisor** เป็น Process Manager สำหรับ Linux ที่ช่วยจัดการโปรแกรมที่รันเป็น Background Service โดยมีความสามารถหลักดังนี้:

- ✅ **Auto-start**: เปิดโปรแกรมอัตโนมัติเมื่อเครื่อง Boot
- ✅ **Auto-restart**: Restart อัตโนมัติเมื่อโปรแกรม Crash
- ✅ **Centralized Management**: จัดการหลายโปรแกรมจากที่เดียว
- ✅ **Logging**: บันทึก Log แยกตามโปรแกรม
- ✅ **Remote Control**: สั่งงานผ่าน API หรือ Command Line

---

## การติดตั้ง

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y supervisor

# ตรวจสอบการติดตั้ง
supervisorctl version
# Output: 4.2.5
```

หลังติดตั้ง Supervisor จะ:
- สร้าง Service: `/usr/lib/systemd/system/supervisor.service`
- สร้างโฟลเดอร์ Config: `/etc/supervisor/conf.d/`
- เปิดใช้งานอัตโนมัติ (Auto-start on boot)

---

## โครงสร้างไฟล์

```
/etc/supervisor/
├── supervisord.conf           # Config หลักของ Supervisor
└── conf.d/                    # โฟลเดอร์สำหรับ Config แต่ละโปรแกรม
    ├── nvr-backend.conf       # Config สำหรับ NVR Backend
    ├── dashboard-api.conf     # Config สำหรับโปรเจกต์อื่น (ตัวอย่าง)
    └── data-scraper.conf      # Config สำหรับโปรเจกต์อื่น (ตัวอย่าง)
```

---

## การสร้าง Config File

### ตัวอย่าง: NVR Backend

สร้างไฟล์ `/etc/supervisor/conf.d/nvr-backend.conf`:

```ini
[program:nvr-backend]
command=/home/pongsak/projects/yolov11_inference_cpu/run_app.sh
directory=/home/pongsak/projects/yolov11_inference_cpu
autostart=false
autorestart=true
user=pongsak
stdout_logfile=/var/log/nvr-backend.log
stderr_logfile=/var/log/nvr-backend-error.log
environment=PATH="/home/pongsak/.local/bin:/usr/local/bin:/usr/bin:/bin"
```

### คำอธิบาย Parameters

| Parameter | คำอธิบาย | ค่าแนะนำ |
|-----------|----------|----------|
| `command` | คำสั่งที่ใช้เริ่มโปรแกรม | Path เต็มของ script หรือ executable |
| `directory` | Working directory | Path ของโปรเจกต์ |
| `autostart` | เปิดอัตโนมัติตอน Boot | `false` (Development), `true` (Production) |
| `autorestart` | Restart อัตโนมัติถ้า Crash | `true` (แนะนำ) |
| `user` | User ที่รันโปรแกรม | ชื่อ User ของคุณ |
| `stdout_logfile` | ไฟล์ Log สำหรับ Output ปกติ | `/var/log/program-name.log` |
| `stderr_logfile` | ไฟล์ Log สำหรับ Error | `/var/log/program-name-error.log` |
| `environment` | Environment Variables | `PATH`, `PYTHONPATH`, etc. |

---

## คำสั่งพื้นฐาน

### 1. โหลด Config ใหม่

หลังสร้างหรือแก้ไข `.conf` ต้องโหลดเข้า Supervisor:

```bash
sudo supervisorctl reread   # อ่าน Config ใหม่
sudo supervisorctl update   # Apply การเปลี่ยนแปลง
```

### 2. เริ่ม/หยุด/Restart โปรแกรม

```bash
# เริ่มโปรแกรม
sudo supervisorctl start nvr-backend

# หยุดโปรแกรม
sudo supervisorctl stop nvr-backend

# Restart โปรแกรม
sudo supervisorctl restart nvr-backend

# Restart ทุกโปรแกรม
sudo supervisorctl restart all
```

### 3. ดูสถานะ

```bash
# ดูสถานะโปรแกรมเดียว
sudo supervisorctl status nvr-backend

# ดูสถานะทุกโปรแกรม
sudo supervisorctl status

# Output ตัวอย่าง:
# nvr-backend      RUNNING   pid 12345, uptime 2:15:30
# dashboard-api    RUNNING   pid 12346, uptime 2:15:30
# data-scraper     STOPPED   Not started
```

### 4. ดู Log

```bash
# ดู Log แบบ Real-time
sudo supervisorctl tail -f nvr-backend

# ดู Error Log
sudo supervisorctl tail -f nvr-backend stderr

# หรือใช้ tail ปกติ
tail -f /var/log/nvr-backend.log
tail -f /var/log/nvr-backend-error.log
```

### 5. จัดการ Supervisor Service

```bash
# Restart Supervisor เอง (ถ้าแก้ supervisord.conf)
sudo systemctl restart supervisor

# ดูสถานะ Supervisor
sudo systemctl status supervisor

# เปิด/ปิด Auto-start
sudo systemctl enable supervisor   # เปิดอัตโนมัติตอน Boot
sudo systemctl disable supervisor  # ปิดอัตโนมัติ
```

---

## การใช้งานกับหลายโปรเจกต์

### ตัวอย่าง: จัดการ 3 โปรเจกต์พร้อมกัน

#### 1. NVR Backend (Python/FastAPI)
```ini
# /etc/supervisor/conf.d/nvr-backend.conf
[program:nvr-backend]
command=/home/pongsak/projects/yolov11_inference_cpu/run_app.sh
directory=/home/pongsak/projects/yolov11_inference_cpu
autostart=true
autorestart=true
user=pongsak
```

#### 2. Dashboard API (Node.js)
```ini
# /etc/supervisor/conf.d/dashboard-api.conf
[program:dashboard-api]
command=/usr/bin/node server.js
directory=/home/pongsak/projects/dashboard
autostart=true
autorestart=true
user=pongsak
environment=NODE_ENV="production",PORT="4000"
```

#### 3. Data Scraper (Python Script)
```ini
# /etc/supervisor/conf.d/data-scraper.conf
[program:data-scraper]
command=/home/pongsak/.venv/bin/python scraper.py
directory=/home/pongsak/projects/scraper
autostart=true
autorestart=true
user=pongsak
```

### จัดการทั้งหมด:

```bash
# โหลด Config ทั้งหมด
sudo supervisorctl reread
sudo supervisorctl update

# ดูสถานะทั้งหมด
sudo supervisorctl status

# Restart เฉพาะโปรเจกต์ที่ต้องการ
sudo supervisorctl restart nvr-backend
sudo supervisorctl restart dashboard-api

# Restart ทุกโปรเจกต์
sudo supervisorctl restart all
```

---

## การใช้งานผ่าน API (Backend Integration)

### Python Example

```python
import subprocess

def restart_backend():
    """Restart NVR Backend via Supervisor"""
    result = subprocess.run(
        ["sudo", "supervisorctl", "restart", "nvr-backend"],
        capture_output=True,
        text=True
    )
    return result.returncode == 0

# ใช้งาน
if restart_backend():
    print("Backend restarted successfully")
else:
    print("Failed to restart backend")
```

### ให้สิทธิ์ sudo โดยไม่ต้องใส่รหัสผ่าน (สำหรับ API)

เพิ่มใน `/etc/sudoers.d/supervisor`:

```bash
# สร้างไฟล์
sudo visudo -f /etc/sudoers.d/supervisor

# เพิ่มบรรทัดนี้ (แทน 'pongsak' ด้วย username ของคุณ)
pongsak ALL=(ALL) NOPASSWD: /usr/bin/supervisorctl restart nvr-backend
pongsak ALL=(ALL) NOPASSWD: /usr/bin/supervisorctl status nvr-backend
```

หลังจากนั้น Backend สามารถเรียก `sudo supervisorctl restart nvr-backend` ได้โดยไม่ต้องใส่รหัสผ่าน

---

## Troubleshooting

### 1. โปรแกรมไม่เริ่มทำงาน

```bash
# ดู Error Log
sudo supervisorctl tail nvr-backend stderr

# ตรวจสอบว่า Command ถูกต้องหรือไม่
# ลองรันคำสั่งใน Config โดยตรง
/home/pongsak/projects/yolov11_inference_cpu/run_app.sh
```

### 2. โปรแกรม Restart ซ้ำๆ (Crash Loop)

```bash
# ดู Log เพื่อหาสาเหตุ
sudo supervisorctl tail -f nvr-backend stderr

# ปิด Auto-restart ชั่วคราวเพื่อ Debug
# แก้ไข .conf: autorestart=false
sudo supervisorctl reread
sudo supervisorctl update
```

### 3. Supervisor ไม่ตอบสนอง

```bash
# Restart Supervisor Service
sudo systemctl restart supervisor

# ตรวจสอบสถานะ
sudo systemctl status supervisor
```

### 4. Permission Denied

```bash
# ตรวจสอบว่า User มีสิทธิ์รันโปรแกรมหรือไม่
ls -la /home/pongsak/projects/yolov11_inference_cpu/run_app.sh

# เพิ่มสิทธิ์ Execute
chmod +x /home/pongsak/projects/yolov11_inference_cpu/run_app.sh
```

---

## Best Practices

### 1. ใช้ Absolute Path เสมอ
❌ **ไม่ดี:**
```ini
command=./run_app.sh
```

✅ **ดี:**
```ini
command=/home/pongsak/projects/yolov11_inference_cpu/run_app.sh
```

### 2. ตั้งค่า Environment Variables ที่จำเป็น
```ini
environment=PATH="/home/pongsak/.local/bin:/usr/bin",PYTHONPATH="/home/pongsak/projects"
```

### 3. แยก Log แต่ละโปรแกรม
```ini
stdout_logfile=/var/log/nvr-backend.log
stderr_logfile=/var/log/nvr-backend-error.log
```

### 4. ใช้ `autostart=false` ในช่วง Development
```ini
autostart=false  # ไม่เปิดอัตโนมัติ (สะดวกในการ Debug)
autorestart=true # แต่ยัง Auto-restart ถ้า Crash
```

### 5. Rotate Log Files (ป้องกัน Disk เต็ม)

ติดตั้ง logrotate:
```bash
sudo nano /etc/logrotate.d/nvr-backend
```

```
/var/log/nvr-backend*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
```

---

## สรุป

| คำสั่ง | ความหมาย |
|--------|----------|
| `sudo supervisorctl reread` | อ่าน Config ใหม่ |
| `sudo supervisorctl update` | Apply การเปลี่ยนแปลง |
| `sudo supervisorctl start <name>` | เริ่มโปรแกรม |
| `sudo supervisorctl stop <name>` | หยุดโปรแกรม |
| `sudo supervisorctl restart <name>` | Restart โปรแกรม |
| `sudo supervisorctl status` | ดูสถานะทุกโปรแกรม |
| `sudo supervisorctl tail -f <name>` | ดู Log แบบ Real-time |

**ข้อดีของ Supervisor:**
- ✅ จัดการหลายโปรแกรมได้
- ✅ Auto-restart เมื่อ Crash
- ✅ Log แยกตามโปรแกรม
- ✅ เรียกผ่าน API ได้
- ✅ Production-ready

**เหมาะกับ:**
- Development (รัน Backend ในเครื่อง)
- Production (VM/VPS ที่ไม่ใช้ Docker)
