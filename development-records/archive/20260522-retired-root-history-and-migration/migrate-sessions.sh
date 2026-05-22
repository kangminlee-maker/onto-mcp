#!/bin/bash
# onto migration script
# Moves runtime data from previous versions to the new .onto/ structure.
#
# Migration targets:
#   1. .claude/sessions/   -> .onto/review/ and .onto/builds/
#   2. .claude/learnings/  -> .onto/learnings/
#   3. .claude/ontology/   -> .onto/builds/{session-id}/
#   4. .onto/sessions/ intermediate layer removal (sessions/review/ -> review/)
#   5. domain: + secondary_domains: -> domains: unordered set in .onto/config.yml
#   6. ~/.claude/agent-memory/ -> ~/.onto/ (global data separation)
#
# Usage:
#   ./migrate-sessions.sh                # Migrate project in current directory
#   ./migrate-sessions.sh /path/to/project  # Migrate specified project
#   ./migrate-sessions.sh --dry-run      # Preview targets without actual moves

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

DRY_RUN=false
PROJECT_DIR=""

# Argument processing
for arg in "$@"; do
    case "$arg" in
        --dry-run)
            DRY_RUN=true
            ;;
        *)
            PROJECT_DIR="$arg"
            ;;
    esac
done

# Determine project directory
if [ -z "$PROJECT_DIR" ]; then
    PROJECT_DIR="$(pwd)"
fi

# Convert to absolute path
PROJECT_DIR="$(cd "$PROJECT_DIR" 2>/dev/null && pwd)" || {
    echo -e "${RED}Directory not found: $PROJECT_DIR${NC}"
    exit 1
}

NEW_DIR="$PROJECT_DIR/.onto"

echo ""
echo -e "${CYAN}--- onto migration ---${NC}"
echo ""
echo "Project: $PROJECT_DIR"
echo ""

TOTAL_ACTIONS=0

# --- Step 1: .claude/sessions/ -> .onto/{process}/ ---

OLD_SESSIONS="$PROJECT_DIR/.claude/sessions"

if [ -d "$OLD_SESSIONS" ]; then
    echo -e "${CYAN}[1/4] .claude/sessions/ found${NC}"

    for process_dir in "$OLD_SESSIONS"/*/; do
        [ -d "$process_dir" ] || continue
        process_name=$(basename "$process_dir")
        # buildfromcode -> builds conversion
        [ "$process_name" = "buildfromcode" ] && process_name="builds"

        for session_dir in "$process_dir"*/; do
            [ -d "$session_dir" ] || continue
            session_id=$(basename "$session_dir")
            file_count=$(find "$session_dir" -type f | wc -l | tr -d ' ')
            echo -e "  ${process_name}/${session_id} (${file_count} files)"
            ((TOTAL_ACTIONS++))

            if [ "$DRY_RUN" = false ]; then
                dst="$NEW_DIR/$process_name/$session_id"
                if [ -d "$dst" ]; then
                    # If already exists, merge round directories
                    for sub in "$session_dir"*/; do
                        [ -d "$sub" ] || continue
                        sub_name=$(basename "$sub")
                        if [ ! -d "$dst/$sub_name" ]; then
                            mv "$sub" "$dst/$sub_name"
                        fi
                    done
                else
                    mkdir -p "$(dirname "$dst")"
                    mv "$session_dir" "$dst"
                fi
                echo -e "    ${GREEN}-> .onto/${process_name}/${session_id}${NC}"
            fi
        done
    done

    if [ "$DRY_RUN" = false ]; then
        rm -rf "$OLD_SESSIONS"
        echo -e "  ${GREEN}.claude/sessions/ deleted${NC}"
    fi
    echo ""
else
    echo -e "[1/4] .claude/sessions/ -- not found (skipped)"
    echo ""
fi

# --- Step 2: .claude/learnings/ -> .onto/learnings/ ---

OLD_LEARNINGS="$PROJECT_DIR/.claude/learnings"

if [ -d "$OLD_LEARNINGS" ]; then
    file_count=$(find "$OLD_LEARNINGS" -type f -name "*.md" | wc -l | tr -d ' ')
    echo -e "${CYAN}[2/4] .claude/learnings/ found (${file_count} files)${NC}"
    ((TOTAL_ACTIONS++))

    if [ "$DRY_RUN" = false ]; then
        mkdir -p "$NEW_DIR/learnings"
        for f in "$OLD_LEARNINGS"/*.md; do
            [ -f "$f" ] || continue
            fname=$(basename "$f")
            if [ ! -f "$NEW_DIR/learnings/$fname" ]; then
                mv "$f" "$NEW_DIR/learnings/$fname"
                echo -e "  ${GREEN}Moved: $fname${NC}"
            else
                echo -e "  ${YELLOW}Skipped: $fname (already exists)${NC}"
            fi
        done
        # Handle remaining files like .gitkeep
        remaining=$(find "$OLD_LEARNINGS" -type f | wc -l | tr -d ' ')
        if [ "$remaining" -eq 0 ]; then
            rm -rf "$OLD_LEARNINGS"
            echo -e "  ${GREEN}.claude/learnings/ deleted${NC}"
        fi
    fi
    echo ""
else
    echo -e "[2/4] .claude/learnings/ -- not found (skipped)"
    echo ""
fi

# --- Step 3: .claude/ontology/ -> .onto/builds/{session-id}/ ---

OLD_ONTOLOGY="$PROJECT_DIR/.claude/ontology"

if [ -d "$OLD_ONTOLOGY" ]; then
    file_count=$(find "$OLD_ONTOLOGY" -type f | wc -l | tr -d ' ')
    echo -e "${CYAN}[3/4] .claude/ontology/ found (${file_count} files)${NC}"
    ((TOTAL_ACTIONS++))

    # Find existing build session (map to most recent builds session)
    BUILD_SESSION=""
    if [ -d "$NEW_DIR/builds" ]; then
        BUILD_SESSION=$(ls -1 "$NEW_DIR/builds/" 2>/dev/null | sort -r | head -1)
    fi

    if [ -z "$BUILD_SESSION" ]; then
        # No build session found, create new one
        BUILD_SESSION="migrated-$(date +%Y%m%d)"
        echo -e "  No existing build session -> creating builds/${BUILD_SESSION}/"
    else
        echo -e "  Existing build session found -> merging into builds/${BUILD_SESSION}/"
    fi

    if [ "$DRY_RUN" = false ]; then
        dst="$NEW_DIR/builds/$BUILD_SESSION"
        mkdir -p "$dst"
        for item in "$OLD_ONTOLOGY"/*; do
            [ -e "$item" ] || continue
            item_name=$(basename "$item")
            if [ ! -e "$dst/$item_name" ]; then
                mv "$item" "$dst/$item_name"
                echo -e "  ${GREEN}Moved: $item_name${NC}"
            else
                echo -e "  ${YELLOW}Skipped: $item_name (already exists)${NC}"
            fi
        done
        remaining=$(find "$OLD_ONTOLOGY" -type f 2>/dev/null | wc -l | tr -d ' ')
        if [ "$remaining" -eq 0 ]; then
            rm -rf "$OLD_ONTOLOGY"
            echo -e "  ${GREEN}.claude/ontology/ deleted${NC}"
        fi
    fi
    echo ""
else
    echo -e "[3/4] .claude/ontology/ -- not found (skipped)"
    echo ""
fi

# --- Step 4: .onto/sessions/ intermediate layer removal ---

OLD_SESSIONS_LAYER="$NEW_DIR/sessions"

if [ -d "$OLD_SESSIONS_LAYER" ]; then
    echo -e "${CYAN}[4/4] .onto/sessions/ intermediate layer found -- removing${NC}"
    ((TOTAL_ACTIONS++))

    for process_dir in "$OLD_SESSIONS_LAYER"/*/; do
        [ -d "$process_dir" ] || continue
        process_name=$(basename "$process_dir")
        # buildfromcode -> builds conversion
        [ "$process_name" = "buildfromcode" ] && process_name="builds"
        [ "$process_name" = "build" ] && process_name="builds"

        for session_dir in "$process_dir"*/; do
            [ -d "$session_dir" ] || continue
            session_id=$(basename "$session_dir")
            echo -e "  sessions/${process_name}/${session_id}"

            if [ "$DRY_RUN" = false ]; then
                dst="$NEW_DIR/$process_name/$session_id"
                mkdir -p "$dst"
                for sub in "$session_dir"*/; do
                    [ -d "$sub" ] || continue
                    sub_name=$(basename "$sub")
                    if [ ! -d "$dst/$sub_name" ]; then
                        mv "$sub" "$dst/$sub_name"
                    fi
                done
                echo -e "    ${GREEN}-> .onto/${process_name}/${session_id}${NC}"
            fi
        done
    done

    if [ "$DRY_RUN" = false ]; then
        rm -rf "$OLD_SESSIONS_LAYER"
        echo -e "  ${GREEN}.onto/sessions/ deleted${NC}"
    fi
    echo ""
else
    echo -e "[4/4] .onto/sessions/ -- not found (skipped)"
    echo ""
fi

# --- Step 5: Domain config migration -> .onto/config.yml (domains: unordered set) ---

CLAUDE_MD="$PROJECT_DIR/CLAUDE.md"
CONFIG_YML="$NEW_DIR/config.yml"

# Step 5a: Migrate existing config.yml from old format (domain: + secondary_domains:) to new (domains:)
if [ -f "$CONFIG_YML" ]; then
    OLD_DOMAIN=$(grep -E '^\s*domain\s*:' "$CONFIG_YML" 2>/dev/null | head -1 | sed 's/.*:\s*//' | tr -d ' ')
    OLD_SECONDARY=$(grep -E '^\s*secondary_domains\s*:' "$CONFIG_YML" 2>/dev/null | head -1 | sed 's/.*:\s*//')
    HAS_DOMAINS=$(grep -E '^\s*domains\s*:' "$CONFIG_YML" 2>/dev/null | head -1)

    if [ -n "$OLD_DOMAIN" ] && [ -z "$HAS_DOMAINS" ]; then
        echo -e "${CYAN}[5/6] Old domain format found in config.yml: domain: ${OLD_DOMAIN}${NC}"
        ((TOTAL_ACTIONS++))

        if [ "$DRY_RUN" = false ]; then
            # Build domains list
            DOMAINS_LIST="  - $OLD_DOMAIN"
            if [ -n "$OLD_SECONDARY" ]; then
                # Parse comma-separated secondary domains
                IFS=',' read -ra SEC_ARRAY <<< "$OLD_SECONDARY"
                for sec in "${SEC_ARRAY[@]}"; do
                    sec_trimmed=$(echo "$sec" | tr -d ' ')
                    [ -n "$sec_trimmed" ] && DOMAINS_LIST="$DOMAINS_LIST\n  - $sec_trimmed"
                done
            fi

            # Remove old domain/secondary_domains lines, add domains: list
            sed -i '' '/^\s*domain\s*:/d' "$CONFIG_YML"
            sed -i '' '/^\s*secondary_domains\s*:/d' "$CONFIG_YML"

            # Add domains: at the beginning (after output_language if present)
            if grep -q 'output_language' "$CONFIG_YML"; then
                # Insert after output_language line
                sed -i '' "/output_language/a\\
domains:\\
$DOMAINS_LIST" "$CONFIG_YML"
            else
                # Prepend
                TEMP_FILE=$(mktemp)
                printf "domains:\n$DOMAINS_LIST\n" > "$TEMP_FILE"
                cat "$CONFIG_YML" >> "$TEMP_FILE"
                mv "$TEMP_FILE" "$CONFIG_YML"
            fi

            echo -e "  ${GREEN}-> Converted to domains: unordered set${NC}"
        fi
        echo ""
    elif [ -n "$HAS_DOMAINS" ]; then
        echo -e "[5/6] config.yml already uses domains: format (skipped)"
        echo ""
    else
        echo -e "[5/6] No domain setting in config.yml (skipped)"
        echo ""
    fi
# Step 5b: Extract from CLAUDE.md if no config.yml exists
elif [ -f "$CLAUDE_MD" ]; then
    DOMAIN=$(grep -E '^\s*(domain|agent-domain)\s*:' "$CLAUDE_MD" 2>/dev/null | head -1 | sed 's/.*:\s*//' | tr -d ' ')
    SECONDARY=$(grep -E '^\s*secondary_domains\s*:' "$CLAUDE_MD" 2>/dev/null | head -1 | sed 's/.*:\s*//')

    if [ -n "$DOMAIN" ]; then
        echo -e "${CYAN}[5/6] Domain setting found in CLAUDE.md: ${DOMAIN}${NC}"
        ((TOTAL_ACTIONS++))

        if [ "$DRY_RUN" = false ]; then
            mkdir -p "$NEW_DIR"

            # Build domains: list format
            echo "domains:" > "$CONFIG_YML"
            echo "  - $DOMAIN" >> "$CONFIG_YML"
            if [ -n "$SECONDARY" ]; then
                IFS=',' read -ra SEC_ARRAY <<< "$SECONDARY"
                for sec in "${SEC_ARRAY[@]}"; do
                    sec_trimmed=$(echo "$sec" | tr -d ' ')
                    [ -n "$sec_trimmed" ] && echo "  - $sec_trimmed" >> "$CONFIG_YML"
                done
            fi

            echo -e "  ${GREEN}-> .onto/config.yml created with domains: format${NC}"
            echo -e "  ${YELLOW}Please manually remove the domain/secondary_domains lines from CLAUDE.md.${NC}"
            echo -e "  ${YELLOW}(Backward compatible: leaving them does not affect functionality)${NC}"
        fi
        echo ""
    else
        echo -e "[5/6] No domain setting in CLAUDE.md (skipped)"
        echo ""
    fi
else
    echo -e "[5/6] No CLAUDE.md or config.yml found (skipped)"
    echo ""
fi

# --- Step 6: ~/.claude/agent-memory/ -> ~/.onto/ (global data) ---

OLD_GLOBAL="$HOME/.claude/agent-memory"
NEW_GLOBAL="$HOME/.onto"

if [ -d "$OLD_GLOBAL" ]; then
    file_count=$(find "$OLD_GLOBAL" -type f | wc -l | tr -d ' ')
    echo -e "${CYAN}[6/6] ~/.claude/agent-memory/ found (${file_count} files)${NC}"
    echo "  -> Moving to ~/.onto/"
    ((TOTAL_ACTIONS++))

    if [ "$DRY_RUN" = false ]; then
        # Move by subdirectory (methodology, communication, domains)
        for subdir in "$OLD_GLOBAL"/*/; do
            [ -d "$subdir" ] || continue
            subname=$(basename "$subdir")
            dst="$NEW_GLOBAL/$subname"

            if [ -d "$dst" ]; then
                # If already exists, merge at file level (do not overwrite existing files)
                find "$subdir" -type f | while read -r srcfile; do
                    relpath="${srcfile#$subdir}"
                    dstfile="$dst/$relpath"
                    if [ ! -f "$dstfile" ]; then
                        mkdir -p "$(dirname "$dstfile")"
                        mv "$srcfile" "$dstfile"
                        echo -e "  ${GREEN}Moved: $subname/$relpath${NC}"
                    else
                        echo -e "  ${YELLOW}Skipped: $subname/$relpath (already exists)${NC}"
                    fi
                done
            else
                mkdir -p "$(dirname "$dst")"
                mv "$subdir" "$dst"
                echo -e "  ${GREEN}Moved: $subname/${NC}"
            fi
        done

        # Clean up empty directories
        remaining=$(find "$OLD_GLOBAL" -type f 2>/dev/null | wc -l | tr -d ' ')
        if [ "$remaining" -eq 0 ]; then
            rm -rf "$OLD_GLOBAL"
            echo -e "  ${GREEN}~/.claude/agent-memory/ deleted${NC}"
        else
            echo -e "  ${YELLOW}${remaining} files remain. Manual review needed: ~/.claude/agent-memory/${NC}"
        fi
    fi
    echo ""
else
    echo -e "[6/6] ~/.claude/agent-memory/ -- not found (skipped)"
    echo ""
fi

# --- Complete ---

if [ $TOTAL_ACTIONS -eq 0 ]; then
    echo -e "${GREEN}No migration needed -- no data from previous versions found.${NC}"
else
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[dry-run] No actual moves were performed.${NC}"
    else
        echo -e "${GREEN}Migration complete.${NC}"
    fi
fi

echo ""
echo "Final structure:"
echo ""
echo "  Global (~/.onto/):"
echo "  +-- methodology/{agent-id}.md    # Methodology learnings"
echo "  +-- communication/               # Communication learnings"
echo "  +-- domains/{domain}/            # Domain documents + global learnings"
echo ""
echo "  Project ({project}/.onto/):"
echo "  +-- config.yml                   # Domain configuration"
echo "  +-- review/{session-id}/round1/  # Review results"
echo "  +-- builds/{session-id}/round0~N/# Build results"
echo "  +-- learnings/                   # Project-level learnings"
echo ""
