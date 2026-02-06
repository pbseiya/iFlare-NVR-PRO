#!/bin/bash
# YOLOv11 Inference System - Setup Script
# สำหรับติดตั้ง dependencies และ setup environment

set -e  # Exit on error

SUDO_PASSWORD="Seiya010"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "YOLOv11 Inference System - Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 1. Update system packages
echo "1. Updating system packages..."
echo "$SUDO_PASSWORD" | sudo -S apt-get update -qq
print_success "System packages updated"
echo ""

# 2. Install Docker (if not exists)
echo "2. Checking Docker installation..."
if command_exists docker; then
    print_info "Docker already installed: $(docker --version)"
else
    print_info "Installing Docker..."
    echo "$SUDO_PASSWORD" | sudo -S apt-get install -y docker.io docker-compose
    echo "$SUDO_PASSWORD" | sudo -S usermod -aG docker $USER
    print_success "Docker installed"
    print_info "Please log out and log back in for Docker group changes to take effect"
fi
echo ""

# 3. Install Python dependencies with uv
echo "3. Installing Python dependencies..."
if ! command_exists uv; then
    print_info "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.cargo/bin:$PATH"
fi

print_info "Installing Python packages with uv..."
cd "$PROJECT_ROOT"
# Dependencies are managed in pyproject.toml (including CPU-only source)
uv sync
print_success "Python dependencies installed (CPU only)"
echo ""

# 4. Install Node.js (for Web UI development)
echo "4. Checking Node.js installation..."
if command_exists node; then
    print_info "Node.js already installed: $(node --version)"
else
    print_info "Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | echo "$SUDO_PASSWORD" | sudo -S -E bash -
    echo "$SUDO_PASSWORD" | sudo -S apt-get install -y nodejs
    print_success "Node.js installed"
fi
echo ""

# 5. Install C++ dependencies (for C++ implementation)
echo "5. Installing C++ build tools & OpenVINO..."
echo "$SUDO_PASSWORD" | sudo -S apt-get install -y \
    cmake \
    build-essential \
    pkg-config \
    libopencv-dev \
    libpqxx-dev

# OpenVINO Installation via APT (Ubuntu)
if ! dpkg -l | grep -q openvino; then
    print_info "Installing OpenVINO Runtime from Intel APT repository..."
    # Add key
    wget https://apt.repos.intel.com/intel-gpg-keys/GPG-PUB-KEY-INTEL-SW-PRODUCTS.PUB
    echo "$SUDO_PASSWORD" | sudo -S apt-key add GPG-PUB-KEY-INTEL-SW-PRODUCTS.PUB
    rm GPG-PUB-KEY-INTEL-SW-PRODUCTS.PUB
    # Add repo
    echo "deb https://apt.repos.intel.com/openvino/2024 ubuntu24 main" | echo "$SUDO_PASSWORD" | sudo -S tee /etc/apt/sources.list.d/intel-openvino-2024.list
    echo "$SUDO_PASSWORD" | sudo -S apt-get update
    # Install runtime
    echo "$SUDO_PASSWORD" | sudo -S apt-get install -y openvino
    print_success "OpenVINO installed"
else
    print_info "OpenVINO already installed"
fi

print_success "C++ build tools installed"
echo ""

# 6. Install Rust (for Rust implementation)
echo "6. Checking Rust installation..."
if command_exists rustc; then
    print_info "Rust already installed: $(rustc --version)"
else
    print_info "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    print_success "Rust installed"
fi

# Rust OpenVINO binding requirements
echo "Installing Rust OpenVINO binding requirements (clang)..."
echo "$SUDO_PASSWORD" | sudo -S apt-get install -y clang libclang-dev
print_success "Rust dev tools installed"

# 7. Build Projects
print_info "Building C++ Project..."
mkdir -p "$PROJECT_ROOT/src/cpp/build"
cd "$PROJECT_ROOT/src/cpp/build"
cmake ..
make -j$(nproc)
print_success "C++ Project Built"

print_info "Building Rust Project..."
cd "$PROJECT_ROOT/src/rust"
cargo build --release
print_success "Rust Project Built"

# 8. Create necessary directories
echo "8. Creating project directories..."
mkdir -p "$PROJECT_ROOT/models"
mkdir -p "$PROJECT_ROOT/videos"
mkdir -p "$PROJECT_ROOT/videos/output"
mkdir -p "$PROJECT_ROOT/database"
mkdir -p "$PROJECT_ROOT/backend"
mkdir -p "$PROJECT_ROOT/web-ui/config"
mkdir -p "$PROJECT_ROOT/web-ui/nvr"
mkdir -p "$PROJECT_ROOT/src/python/core"
mkdir -p "$PROJECT_ROOT/src/cpp/core"
mkdir -p "$PROJECT_ROOT/src/rust/src/core"
print_success "Directories created"
echo ""

# 8. Copy .env.example to .env if not exists
echo "8. Setting up environment variables..."
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    print_success ".env file created from .env.example"
    print_info "Please edit .env file to configure your settings"
else
    print_info ".env file already exists"
fi
echo ""

# 9. Setup PostgreSQL (Using shared_postgres)
echo "9. Setting up PostgreSQL database..."
CONTAINER_NAME="shared_postgres"
DB_NAME="yolov11_inference"
DB_USER="admin"

if docker ps | grep -q "$CONTAINER_NAME"; then
    print_info "Found running container: $CONTAINER_NAME"
    
    # Check if database exists
    if docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        print_info "Database $DB_NAME already exists"
    else
        print_info "Creating database $DB_NAME..."
        docker exec "$CONTAINER_NAME" createdb -U "$DB_USER" "$DB_NAME"
        print_success "Database created"
    fi
else
    print_error "Container $CONTAINER_NAME is not running! Please start it first."
    exit 1
fi

# Wait for PostgreSQL to be ready
print_info "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        print_success "PostgreSQL is ready"
        break
    fi
    sleep 1
done

# Initialize database schema
print_info "Initializing database schema..."
if [ -f "$PROJECT_ROOT/database/schema.sql" ]; then
    docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" < "$PROJECT_ROOT/database/schema.sql"
    print_success "Database schema initialized"
else
    print_error "schema.sql not found!"
fi
echo ""

# 10. Test database connection
echo "10. Testing database connection..."
if docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
    print_success "Database connection successful"
    
    # Show tables
    print_info "Database tables:"
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "\dt"
else
    print_error "Database connection failed"
fi
echo ""

# 11. Summary
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Review and edit .env file if needed"
echo "2. Place your YOLOv11 models in ./models/ directory"
echo "3. Start development:"
echo "   - Backend: cd backend && uvicorn main:app --reload"
echo "   - Config UI: cd web-ui/config && npm run dev"
echo "   - NVR UI: cd web-ui/nvr && npm run dev"
echo ""
echo "Or use Docker Compose:"
echo "   docker-compose up -d"
echo ""
echo "Database access:"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   Database: yolov11_inference"
echo "   User: admin"
echo "   Password: password"
echo ""
print_success "All done! 🚀"
