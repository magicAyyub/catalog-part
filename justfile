set shell := ["bash", "-uc"]

APP_DIR := "/home/ubuntu/catalog-part"
APP_NAME := "jumbopneus-catalog-part"
BACKUP_SERVICE := "jumbopneus-catalog-backup.service"
BACKUP_DIR := "/var/backups/jumbopneus-catalog"
DOMAIN := "frein.jumbopneus.pro"

# List available commands
default:
    @just --list

# Application status
status:
    pm2 status {{APP_NAME}}

# Real-time application logs
logs:
    pm2 logs {{APP_NAME}}

# Restart the application
restart:
    pm2 restart {{APP_NAME}}

# Stop the application
stop:
    pm2 stop {{APP_NAME}}

# Start the application
start:
    pm2 start {{APP_NAME}}

# Health check local endpoint
health:
    @curl -fsS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000

# Open a shell in the application directory
shell:
    cd {{APP_DIR}} && exec bash

# Build project and restart application to apply changes
build:
    cd {{APP_DIR}} && npm run build && pm2 restart {{APP_NAME}}

# Rebuild and reload application gracefully
reload:
    cd {{APP_DIR}} && npm run build && pm2 reload {{APP_NAME}}

# Update dependencies
update-deps:
    cd {{APP_DIR}} && npm update

# Trigger immediate SQLite backup
backup:
    sudo systemctl start {{BACKUP_SERVICE}}

# List stored backups
backups:
    sudo ls -lah {{BACKUP_DIR}}

# Verify integrity of latest backup
db-check:
    #!/usr/bin/env bash
    set -euo pipefail
    latest="$(sudo find "{{BACKUP_DIR}}" -maxdepth 1 -type f -name 'app-*.db' -printf '%T@ %p\n' | sort -nr | head -n1 | cut -d' ' -f2-)"
    if [[ -z "$latest" ]]; then
        echo "No backup file found."
        exit 1
    fi
    echo "Checking integrity of: $latest"
    sudo sqlite3 "$latest" "PRAGMA integrity_check;"

# Check status of automatic backup service
backup-status:
    systemctl status {{BACKUP_SERVICE}} --no-pager
    systemctl status jumbopneus-catalog-backup.timer --no-pager

# Test Nginx configuration
nginx-test:
    sudo nginx -t

# Reload Nginx service
nginx-reload:
    sudo nginx -t && sudo systemctl reload nginx

# Check HTTPS and security headers
ssl-check:
    curl -sSI https://{{DOMAIN}} | grep -Ei 'HTTP/|server:|strict-transport-security|x-content-type-options|x-frame-options|referrer-policy'

# Nginx service status
nginx-status:
    systemctl status nginx --no-pager

# Firewall status
firewall:
    sudo ufw status verbose

# Fail2ban status
fail2ban:
    sudo fail2ban-client status
    sudo fail2ban-client status sshd

# Overall server running services
server-status:
    systemctl --no-pager --type=service --state=running | grep -E 'nginx|fail2ban|jumbopneus'

# Git repository status
git-status:
    cd {{APP_DIR}} && git status

# Recent commits log
git-log:
    cd {{APP_DIR}} && git log --oneline -10