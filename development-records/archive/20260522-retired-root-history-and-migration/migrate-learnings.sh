#!/bin/bash
# onto learning storage structure migration script
# Converts the previous 3-path structure to the new 2-path + axis tag model.
#
# Migration targets:
#   1. ~/.onto/methodology/{agent-id}.md -> ~/.onto/learnings/{agent-id}.md ([methodology] tag attached)
#   2. ~/.onto/domains/{domain}/learnings/{agent-id}.md -> ~/.onto/learnings/{agent-id}.md ([domain/{domain}] tag attached)
#
# Usage:
#   ./migrate-learnings.sh              # Run migration
#   ./migrate-learnings.sh --dry-run    # Preview targets without actual changes

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

DRY_RUN=false

# Argument processing
for arg in "$@"; do
    case "$arg" in
        --dry-run)
            DRY_RUN=true
            ;;
        *)
            echo -e "${RED}Unknown argument: $arg${NC}"
            echo "Usage: ./migrate-learnings.sh [--dry-run]"
            exit 1
            ;;
    esac
done

GLOBAL_DIR="$HOME/.onto"
METHODOLOGY_DIR="$GLOBAL_DIR/methodology"
DOMAINS_DIR="$GLOBAL_DIR/domains"
LEARNINGS_DIR="$GLOBAL_DIR/learnings"
BACKUP_DIR="$GLOBAL_DIR/_backup_migration_$(date +%Y%m%d)"

echo ""
echo -e "${CYAN}--- Learning storage structure migration (3-path -> 2-path + axis tag) ---${NC}"
echo ""

# --- Check if migration is needed ---

HAS_METHODOLOGY=false
HAS_DOMAIN_LEARNINGS=false

if [ -d "$METHODOLOGY_DIR" ] && [ "$(find "$METHODOLOGY_DIR" -name '*.md' -type f 2>/dev/null | wc -l | tr -d ' ')" -gt 0 ]; then
    HAS_METHODOLOGY=true
fi

if [ -d "$DOMAINS_DIR" ]; then
    for domain_dir in "$DOMAINS_DIR"/*/; do
        [ -d "$domain_dir" ] || continue
        if [ -d "${domain_dir}learnings" ] && [ "$(find "${domain_dir}learnings" -name '*.md' -type f 2>/dev/null | wc -l | tr -d ' ')" -gt 0 ]; then
            HAS_DOMAIN_LEARNINGS=true
            break
        fi
    done
fi

if [ "$HAS_METHODOLOGY" = false ] && [ "$HAS_DOMAIN_LEARNINGS" = false ]; then
    echo -e "${GREEN}No migration needed -- previous structure (methodology/, domains/*/learnings/) not found.${NC}"
    echo ""
    exit 0
fi

# --- Initialize counters ---

SRC_TOTAL=0
DST_TOTAL=0
METHODOLOGY_COUNT=0
DOMAIN_COUNTS=""

# --- Item counting function (lines starting with -) ---

count_items() {
    local file="$1"
    if [ -f "$file" ]; then
        grep -c '^\s*- ' "$file" 2>/dev/null || echo 0
    else
        echo 0
    fi
}

# --- Tag attachment function ---
# Input: file content (stdin), tag
# - [fact] content -> - [fact] [tag] content
# - [judgment] content -> - [judgment] [tag] content
# - content (no tag) -> - [tag] content
# Skipped if the tag already exists

add_axis_tag() {
    local tag="$1"
    while IFS= read -r line; do
        # Non-learning-item lines pass through as-is (headers, blank lines, etc.)
        if ! echo "$line" | grep -qE '^\s*- '; then
            echo "$line"
            continue
        fi

        # Already has the tag, pass through
        if echo "$line" | grep -qF "[$tag]"; then
            echo "$line"
            continue
        fi

        # Has [fact] or [judgment] tag: insert axis tag after type tag
        if echo "$line" | grep -qE '^\s*- \[(fact|judgment)\]'; then
            echo "$line" | sed -E "s/^(\s*- \[(fact|judgment)\])/\1 [$tag]/"
        else
            # No type tag: insert axis tag after -
            echo "$line" | sed -E "s/^(\s*- )/\1[$tag] /"
        fi
    done
}

# --- Backup ---

if [ "$DRY_RUN" = false ]; then
    echo -e "${CYAN}Creating backup...${NC}"
    mkdir -p "$BACKUP_DIR"

    if [ "$HAS_METHODOLOGY" = true ]; then
        cp -r "$METHODOLOGY_DIR" "$BACKUP_DIR/methodology"
        echo -e "  ${GREEN}methodology/ -> _backup_migration_$(date +%Y%m%d)/methodology/${NC}"
    fi

    if [ "$HAS_DOMAIN_LEARNINGS" = true ]; then
        mkdir -p "$BACKUP_DIR/domains"
        for domain_dir in "$DOMAINS_DIR"/*/; do
            [ -d "$domain_dir" ] || continue
            domain_name=$(basename "$domain_dir")
            if [ -d "${domain_dir}learnings" ]; then
                mkdir -p "$BACKUP_DIR/domains/$domain_name"
                cp -r "${domain_dir}learnings" "$BACKUP_DIR/domains/$domain_name/learnings"
                echo -e "  ${GREEN}domains/$domain_name/learnings/ -> _backup_migration_$(date +%Y%m%d)/domains/$domain_name/learnings/${NC}"
            fi
        done
    fi
    echo ""
fi

# --- Step 1: methodology/ -> learnings/ ---

echo -e "${CYAN}[1/2] Processing methodology/${NC}"

if [ "$HAS_METHODOLOGY" = true ]; then
    for agent_file in "$METHODOLOGY_DIR"/*.md; do
        [ -f "$agent_file" ] || continue
        agent_name=$(basename "$agent_file")
        item_count=$(count_items "$agent_file")
        SRC_TOTAL=$((SRC_TOTAL + item_count))
        METHODOLOGY_COUNT=$((METHODOLOGY_COUNT + item_count))

        echo -e "  $agent_name: ${item_count} items -> attaching [methodology] tag"

        if [ "$DRY_RUN" = false ]; then
            mkdir -p "$LEARNINGS_DIR"
            dst="$LEARNINGS_DIR/$agent_name"

            # Attach tags and save to temp
            tagged_content=$(cat "$agent_file" | add_axis_tag "methodology")

            if [ -f "$dst" ]; then
                # Append to existing file (separated by blank line)
                echo "" >> "$dst"
                echo "$tagged_content" >> "$dst"
                echo -e "    ${GREEN}-> learnings/$agent_name (merged)${NC}"
            else
                echo "$tagged_content" > "$dst"
                echo -e "    ${GREEN}-> learnings/$agent_name (created)${NC}"
            fi
        fi
    done
else
    echo -e "  Not found (skipped)"
fi
echo ""

# --- Step 2: domains/{domain}/learnings/ -> learnings/ ---

echo -e "${CYAN}[2/2] Processing domains/*/learnings/${NC}"

if [ "$HAS_DOMAIN_LEARNINGS" = true ]; then
    for domain_dir in "$DOMAINS_DIR"/*/; do
        [ -d "$domain_dir" ] || continue
        domain_name=$(basename "$domain_dir")
        domain_learnings="${domain_dir}learnings"

        [ -d "$domain_learnings" ] || continue

        domain_item_count=0

        for agent_file in "$domain_learnings"/*.md; do
            [ -f "$agent_file" ] || continue
            agent_name=$(basename "$agent_file")
            item_count=$(count_items "$agent_file")
            SRC_TOTAL=$((SRC_TOTAL + item_count))
            domain_item_count=$((domain_item_count + item_count))

            echo -e "  domains/$domain_name/learnings/$agent_name: ${item_count} items -> attaching [domain/$domain_name] tag"

            if [ "$DRY_RUN" = false ]; then
                mkdir -p "$LEARNINGS_DIR"
                dst="$LEARNINGS_DIR/$agent_name"

                tagged_content=$(cat "$agent_file" | add_axis_tag "domain/$domain_name")

                if [ -f "$dst" ]; then
                    echo "" >> "$dst"
                    echo "$tagged_content" >> "$dst"
                    echo -e "    ${GREEN}-> learnings/$agent_name (merged)${NC}"
                else
                    echo "$tagged_content" > "$dst"
                    echo -e "    ${GREEN}-> learnings/$agent_name (created)${NC}"
                fi
            fi
        done

        DOMAIN_COUNTS="$DOMAIN_COUNTS  $domain_name: ${domain_item_count}\n"
    done
else
    echo -e "  Not found (skipped)"
fi
echo ""

# --- Verification: item count consistency check ---

if [ "$DRY_RUN" = false ] && [ -d "$LEARNINGS_DIR" ]; then
    for dst_file in "$LEARNINGS_DIR"/*.md; do
        [ -f "$dst_file" ] || continue
        dst_count=$(count_items "$dst_file")
        DST_TOTAL=$((DST_TOTAL + dst_count))
    done

    echo -e "${CYAN}--- Verification ---${NC}"
    echo ""
    echo -e "  Source item total: ${SRC_TOTAL}"
    echo -e "  Target item total: ${DST_TOTAL}"

    if [ "$DST_TOTAL" -ge "$SRC_TOTAL" ]; then
        echo -e "  ${GREEN}Verification passed (target >= source)${NC}"
    else
        echo -e "  ${RED}Warning: target items fewer than source. Check the backup.${NC}"
        echo -e "  ${RED}Backup location: $BACKUP_DIR${NC}"
    fi
    echo ""
fi

# --- Clean up old directories ---

if [ "$DRY_RUN" = false ]; then
    if [ "$HAS_METHODOLOGY" = true ]; then
        rm -rf "$METHODOLOGY_DIR"
        echo -e "${GREEN}methodology/ deleted${NC}"
    fi

    if [ "$HAS_DOMAIN_LEARNINGS" = true ]; then
        for domain_dir in "$DOMAINS_DIR"/*/; do
            [ -d "$domain_dir" ] || continue
            domain_learnings="${domain_dir}learnings"
            if [ -d "$domain_learnings" ]; then
                rm -rf "$domain_learnings"
                domain_name=$(basename "$domain_dir")
                echo -e "${GREEN}domains/$domain_name/learnings/ deleted${NC}"
            fi
        done
    fi
    echo ""
fi

# --- Summary ---

echo -e "${CYAN}--- Summary ---${NC}"
echo ""
echo -e "  +---------------------+------------+"
echo -e "  | Source              | Items      |"
echo -e "  +---------------------+------------+"
printf "  | methodology/        | %10s |\n" "${METHODOLOGY_COUNT}"

if [ -n "$DOMAIN_COUNTS" ]; then
    echo -e "$DOMAIN_COUNTS" | while IFS= read -r line; do
        [ -z "$line" ] && continue
        domain=$(echo "$line" | sed 's/^\s*//' | cut -d: -f1)
        count=$(echo "$line" | cut -d: -f2 | tr -d ' ')
        printf "  | domain/%-13s| %10s |\n" "$domain" "$count"
    done
fi

echo -e "  +---------------------+------------+"
printf "  | Total               | %10s |\n" "${SRC_TOTAL}"
echo -e "  +---------------------+------------+"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[dry-run] No actual changes were performed.${NC}"
    echo -e "${YELLOW}To run: ./migrate-learnings.sh${NC}"
else
    echo -e "${GREEN}Migration complete.${NC}"
    echo -e "Backup location: $BACKUP_DIR"
fi

echo ""
echo "New learning structure:"
echo ""
echo "  ~/.onto/"
echo "  +-- learnings/{agent-id}.md        # Unified learnings (with axis tags)"
echo "  +-- communication/common.md        # Communication learnings (unchanged)"
echo "  +-- domains/{domain}/              # Domain documents (learnings/ removed)"
echo ""
echo "  Item format: - [fact|judgment] [methodology] [domain/SE] content (source: ...)"
echo ""
