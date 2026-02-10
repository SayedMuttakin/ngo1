#!/bin/bash

# VPS Deployment Script for NGO Management System
# Run this script on your VPS server as root

set -e  # Exit on error

echo "🚀 Starting NGO Management System Deployment..."
echo "================================================"

# Update system
echo "📦 Updating system packages..."
apt-get update -y

# Install Node.js if not installed
if ! command -v node &> /dev/null; then
    echo "📥 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
else
    echo "✅ Node.js already installed: $(node -v)"
fi

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    echo "📥 Installing PM2..."
    npm install -g pm2
else
    echo "✅ PM2 already installed"
fi

# Install Nginx if not installed
if ! command -v nginx &> /dev/null; then
    echo "📥 Installing Nginx..."
    apt-get install -y nginx
else
    echo "✅ Nginx already installed"
fi

# Create ngo1 directory
echo "📁 Creating ngo1 directory..."
cd /root
if [ -d "ngo1" ]; then
    echo "⚠️  ngo1 directory already exists. Backing up..."
    mv ngo1 ngo1_backup_$(date +%Y%m%d_%H%M%S)
fi

# Clone repository
echo "📥 Cloning repository from GitHub..."
git clone https://github.com/SayedMuttakin/ngo1.git
cd ngo1

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install --production

# Create production .env file
echo "📝 Creating production .env file..."
cat > .env << 'EOL'
# Server Configuration
PORT=5000
NODE_ENV=production

# Database Configuration
MONGODB_URI=mongodb+srv://muttakinrhaman626:muttakinrhaman626@satrongs.hhwcbhj.mongodb.net/?retryWrites=true&w=majority&appName=satrongs

# Frontend Configuration
FRONTEND_URL=http://72.61.117.87

# JWT Configuration
JWT_SECRET=ngo1_production_secret_key_$(openssl rand -hex 32)
JWT_EXPIRE=7d

# File Upload Configuration
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# SMS Configuration - BulkSMSBD
BULKSMSBD_API_KEY=74sWxREYrNdB8FoTcGty
BULKSMSBD_SENDER_ID=8809617628650
BULKSMSBD_API_URL=http://bulksmsbd.net/api/smsapi
EOL

# Create uploads directory
echo "📁 Creating uploads directory..."
mkdir -p uploads

# Stop existing PM2 process if running
echo "🛑 Stopping existing PM2 processes..."
pm2 stop ngo1-backend || true
pm2 delete ngo1-backend || true

# Start backend with PM2
echo "🚀 Starting backend with PM2..."
pm2 start server.js --name "ngo1-backend" --time
pm2 save

# Setup PM2 to start on boot
echo "⚙️  Configuring PM2 startup..."
pm2 startup systemd -u root --hp /root
systemctl enable pm2-root

# Configure Nginx
echo "🌐 Configuring Nginx..."
cat > /etc/nginx/sites-available/ngo1 << 'EOL'
server {
    listen 80;
    server_name 72.61.117.87;

    client_max_body_size 10M;

    # Frontend
    location / {
        root /root/ngo1/frontend;
        try_files $uri $uri/ /index.html;
        index index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Static file uploads
    location /uploads {
        alias /root/ngo1/backend/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOL

# Enable Nginx site
ln -sf /etc/nginx/sites-available/ngo1 /etc/nginx/sites-enabled/ngo1
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
echo "🔄 Reloading Nginx..."
nginx -t
systemctl restart nginx

# Configure firewall
echo "🔒 Configuring firewall..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable || true

echo ""
echo "✅ Deployment completed successfully!"
echo "================================================"
echo "🌐 Access your application at: http://72.61.117.87"
echo "📊 Check backend status: pm2 status"
echo "📝 View backend logs: pm2 logs ngo1-backend"
echo "🔄 Restart backend: pm2 restart ngo1-backend"
echo ""
echo "📌 Next Steps:"
echo "   1. Update frontend API URL to point to this server"
echo "   2. (Optional) Configure domain and SSL certificate"
echo "   3. Test all functionality"
echo "================================================"
