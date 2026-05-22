#!/bin/bash
# onto domain base document installation script
# Usage:
#   ./setup-domains.sh              # Interactive -- select domains
#   ./setup-domains.sh --all        # Install all
#   ./setup-domains.sh finance business  # Install specific domains only

set -e

# Path configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAINS_SRC="$SCRIPT_DIR/.onto/domains"
DOMAINS_DST="$HOME/.onto/domains"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

# List available domains
get_available_domains() {
    ls -d "$DOMAINS_SRC"/*/ 2>/dev/null | xargs -I{} basename {} | sort
}

# Count domain files
count_files() {
    local domain="$1"
    ls "$DOMAINS_SRC/$domain"/*.md 2>/dev/null | wc -l | tr -d ' '
}

# Check installation status
check_status() {
    local domain="$1"
    local dst="$DOMAINS_DST/$domain"
    if [ ! -d "$dst" ]; then
        echo "not_installed"
    else
        local src_count=$(count_files "$domain")
        local dst_count=$(ls "$dst"/*.md 2>/dev/null | wc -l | tr -d ' ')
        if [ "$dst_count" -eq 0 ]; then
            echo "empty"
        elif [ "$dst_count" -lt "$src_count" ]; then
            echo "partial"
        else
            echo "installed"
        fi
    fi
}

# Install a single domain
install_domain() {
    local domain="$1"
    local src="$DOMAINS_SRC/$domain"
    local dst="$DOMAINS_DST/$domain"

    if [ ! -d "$src" ]; then
        echo -e "${RED}  x Domain '$domain' not found.${NC}"
        return 1
    fi

    mkdir -p "$dst/learnings"

    local installed=0
    local skipped=0
    local updated=0

    for f in "$src"/*.md; do
        local fname=$(basename "$f")
        local dst_file="$dst/$fname"

        if [ ! -f "$dst_file" ]; then
            cp "$f" "$dst_file"
            ((installed++))
        else
            # If file already exists, compare contents
            if ! diff -q "$f" "$dst_file" > /dev/null 2>&1; then
                cp "$f" "$dst_file"
                ((updated++))
            else
                ((skipped++))
            fi
        fi
    done

    echo -e "${GREEN}  + $domain${NC}: ${installed} installed, ${updated} updated, ${skipped} identical (skipped)"
    echo -e "    Path: $dst"
}

# Display domain list
show_domains() {
    echo ""
    echo -e "${CYAN}Available domains:${NC}"
    echo ""

    local idx=1
    local available=$(get_available_domains)

    for domain in $available; do
        local file_count=$(count_files "$domain")
        local status=$(check_status "$domain")

        local status_label=""
        case $status in
            "installed") status_label="${GREEN}[installed]${NC}" ;;
            "partial")   status_label="${YELLOW}[partially installed]${NC}" ;;
            "empty")     status_label="${YELLOW}[directory only]${NC}" ;;
            *)           status_label="${RED}[not installed]${NC}" ;;
        esac

        echo -e "  ${idx}. ${domain} (${file_count} files) ${status_label}"
        ((idx++))
    done
    echo ""
}

# Main logic
main() {
    echo ""
    echo -e "${CYAN}--- onto domain base document installation ---${NC}"
    echo ""
    echo "Installs domain base documents to ~/.onto/domains/."
    echo "Existing learnings (accumulated knowledge) are preserved."
    echo ""
    echo "Note: Seed domains (created via /onto:create-domain) are stored in ~/.onto/drafts/"
    echo "      and are not affected by this installation."
    echo ""

    local available=$(get_available_domains)

    if [ -z "$available" ]; then
        echo -e "${RED}No domains available for installation. Check the .onto/domains/ directory.${NC}"
        exit 1
    fi

    # Argument processing
    if [ "$1" = "--all" ]; then
        echo -e "Installing all domains."
        echo ""
        for domain in $available; do
            install_domain "$domain"
        done
    elif [ $# -gt 0 ]; then
        echo -e "Installing selected domains: $*"
        echo ""
        for domain in "$@"; do
            install_domain "$domain"
        done
    else
        # Interactive mode
        show_domains

        echo "Select domains to install:"
        echo "  - Separate numbers with commas (e.g., 1,3,5)"
        echo "  - Enter 'all' to install all"
        echo "  - Enter 'q' to cancel"
        echo ""
        read -p "Selection: " choice

        if [ "$choice" = "q" ] || [ "$choice" = "Q" ]; then
            echo "Cancelled."
            exit 0
        fi

        if [ "$choice" = "all" ] || [ "$choice" = "ALL" ]; then
            echo ""
            for domain in $available; do
                install_domain "$domain"
            done
        else
            echo ""
            local domain_array=($available)
            IFS=',' read -ra selections <<< "$choice"
            for sel in "${selections[@]}"; do
                sel=$(echo "$sel" | tr -d ' ')
                local idx=$((sel - 1))
                if [ $idx -ge 0 ] && [ $idx -lt ${#domain_array[@]} ]; then
                    install_domain "${domain_array[$idx]}"
                else
                    echo -e "${RED}  x '$sel' is not a valid number.${NC}"
                fi
            done
        fi
    fi

    echo ""
    echo -e "${GREEN}Installation complete.${NC}"
    echo "To use domains in your project, add the following to .onto/config.yml:"
    echo ""
    echo "  domains:"
    echo "    - {domain-name}"
    echo "    - {another-domain}"
    echo ""
    echo "Or select domains per session when running /onto:review, /onto:build, etc."
    echo ""
    echo "To create a new domain from scratch: /onto:create-domain {name} {description}"
    echo ""
}

main "$@"
