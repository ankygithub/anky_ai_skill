#!/bin/bash

# Survey Research Analyst - Report Rebuild Script
# Usage: bash rebuild.sh [format]
#   format: html (default) | markdown | md | both
# Rebuilds report from Markdown documents
# Compatible with: Git Bash (Windows), macOS Terminal, Linux

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get output format from argument
OUTPUT_FORMAT="${1:-html}"

# Validate format
if [[ "$OUTPUT_FORMAT" != "html" && "$OUTPUT_FORMAT" != "markdown" && "$OUTPUT_FORMAT" != "md" && "$OUTPUT_FORMAT" != "both" ]]; then
    echo -e "${RED}Error: Invalid format '$OUTPUT_FORMAT'${NC}"
    echo "Supported formats:"
    echo "  html     - Build HTML report (default)"
    echo "  markdown - Build Markdown report"
    echo "  md       - Same as markdown"
    echo "  both     - Build both HTML and Markdown reports"
    exit 1
fi

echo -e "${CYAN}===================================${NC}"
echo -e "${CYAN}  Report Rebuild Tool${NC}"
echo -e "${CYAN}  Output Format: $OUTPUT_FORMAT${NC}"
echo -e "${CYAN}===================================${NC}"
echo ""

# Get current directory (project directory)
PROJECT_DIR="$(pwd)"

# Check if we're in a project directory
if [ ! -f "$PROJECT_DIR/project-info.md" ]; then
    echo -e "${RED}Error: Not a valid project directory${NC}"
    echo "Please run this script from a project directory created by init-project.sh"
    exit 1
fi

# Check if docs directory exists
if [ ! -d "$PROJECT_DIR/docs" ]; then
    echo -e "${RED}Error: docs/ directory not found${NC}"
    exit 1
fi

# Find skill directory (templates location)
# First check if SKILL_DIR environment variable is set
if [ -n "$SURVEY_SKILL_DIR" ]; then
    SKILL_DIR="$SURVEY_SKILL_DIR"
else
    # Try to find skill directory relative to this script
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    # Check if script is in project directory (rebuild.sh was copied)
    if [ -f "$SCRIPT_DIR/../templates/build.js" ]; then
        # Script is in scripts/ subdirectory of skill
        SKILL_DIR="$(dirname "$SCRIPT_DIR")"
    elif [ -f "$SCRIPT_DIR/templates/build.js" ]; then
        # Script is in skill root directory
        SKILL_DIR="$SCRIPT_DIR"
    else
        # Script is in project directory, try various paths to find skill directory
        # Get the parent of project directory
        PROJECT_PARENT="$(dirname "$PROJECT_DIR")"
        
        COMMON_PATHS=(
            # From project parent (test directory structure)
            "$PROJECT_PARENT/skill-code/survey-research-analyst"
            "$PROJECT_PARENT/../skill-code/survey-research-analyst"
            # From project itself
            "$PROJECT_DIR/../skill-code/survey-research-analyst"
            "$PROJECT_DIR/../../skill-code/survey-research-analyst"
            # Standard locations
            "$HOME/.skills/survey-research-analyst"
            "/usr/local/share/survey-research-analyst"
            "/opt/survey-research-analyst"
        )
        
        SKILL_DIR=""
        for path in "${COMMON_PATHS[@]}"; do
            # Resolve the path to handle ../
            resolved_path="$(cd "$(dirname "$path")" 2>/dev/null && pwd)/$(basename "$path")" 2>/dev/null || true
            if [ -f "$path/templates/build.js" ]; then
                SKILL_DIR="$path"
                break
            fi
            if [ -n "$resolved_path" ] && [ -f "$resolved_path/templates/build.js" ]; then
                SKILL_DIR="$resolved_path"
                break
            fi
        done
        
        if [ -z "$SKILL_DIR" ]; then
            echo -e "${RED}Error: Cannot find skill templates directory${NC}"
            echo "Searched in:"
            for path in "${COMMON_PATHS[@]}"; do
                echo "  - $path"
            done
            echo ""
            echo "Please set SURVEY_SKILL_DIR environment variable:"
            echo "  export SURVEY_SKILL_DIR=/path/to/survey-research-analyst"
            exit 1
        fi
    fi
fi

echo -e "${GREEN}Project Directory: $PROJECT_DIR${NC}"
echo -e "${GREEN}Skill Directory: $SKILL_DIR${NC}"
echo ""

# Check for Node.js
NODE_CMD=""
if command -v node &> /dev/null; then
    NODE_CMD="node"
elif [ -f "/c/Program Files/nodejs/node.exe" ]; then
    # Windows Git Bash common path
    NODE_CMD="/c/Program Files/nodejs/node.exe"
elif [ -f "/mnt/c/Program Files/nodejs/node.exe" ]; then
    # WSL path
    NODE_CMD="/mnt/c/Program Files/nodejs/node.exe"
fi

if [ -z "$NODE_CMD" ]; then
    echo -e "${RED}Error: Node.js is not installed or not in PATH${NC}"
    echo "Please install Node.js or set NODE_CMD environment variable:"
    echo "  export NODE_CMD=/path/to/node"
    exit 1
fi

echo -e "${GREEN}Using Node.js: $NODE_CMD${NC}"

# Check if required files exist
if [ ! -f "$SKILL_DIR/templates/build.js" ]; then
    echo -e "${RED}Error: build.js not found in $SKILL_DIR/templates/${NC}"
    exit 1
fi

if [ ! -f "$SKILL_DIR/templates/build-md.js" ]; then
    echo -e "${RED}Error: build-md.js not found in $SKILL_DIR/templates/${NC}"
    exit 1
fi

if [ ! -f "$SKILL_DIR/templates/convert-md.js" ]; then
    echo -e "${RED}Error: convert-md.js not found in $SKILL_DIR/templates/${NC}"
    exit 1
fi

if [ ! -f "$SKILL_DIR/templates/report-template.html" ]; then
    echo -e "${RED}Error: report-template.html not found in $SKILL_DIR/templates/${NC}"
    exit 1
fi

if [ ! -f "$SKILL_DIR/templates/styles.css" ]; then
    echo -e "${RED}Error: styles.css not found in $SKILL_DIR/templates/${NC}"
    exit 1
fi

# Count markdown files
MD_COUNT=$(find "$PROJECT_DIR/docs" -name "*.md" | wc -l)
echo -e "${GREEN}Found $MD_COUNT markdown files in docs/${NC}"
echo ""

# Create output directory if not exists
mkdir -p "$PROJECT_DIR/output"

# Function to build HTML report
build_html() {
    echo -e "${YELLOW}Building HTML report...${NC}"
    echo ""
    
    # Copy required files to project dir
    cp "$SKILL_DIR/templates/build.js" "$PROJECT_DIR/"
    cp "$SKILL_DIR/templates/convert-md.js" "$PROJECT_DIR/"
    cp "$SKILL_DIR/templates/report-template.html" "$PROJECT_DIR/"
    cp "$SKILL_DIR/templates/styles.css" "$PROJECT_DIR/"
    
    # Run build
    cd "$PROJECT_DIR"
    if "$NODE_CMD" build.js; then
        echo ""
        echo -e "${GREEN}✓ HTML build complete!${NC}"
        
        # Find the generated file
        PROJECT_NAME=$(grep "^Title:" project-info.md | cut -d':' -f2- | xargs || echo "report")
        SAFE_NAME=$(echo "$PROJECT_NAME" | sed 's/[\\/:*?"<>|]/_/g')
        
        if [ -f "$PROJECT_DIR/output/${SAFE_NAME}_report.html" ]; then
            FILE_SIZE=$(du -h "$PROJECT_DIR/output/${SAFE_NAME}_report.html" | cut -f1)
            echo -e "${CYAN}Output: $PROJECT_DIR/output/${SAFE_NAME}_report.html${NC}"
            echo -e "${CYAN}Size: $FILE_SIZE${NC}"
        elif [ -f "$PROJECT_DIR/output/report.html" ]; then
            FILE_SIZE=$(du -h "$PROJECT_DIR/output/report.html" | cut -f1)
            echo -e "${CYAN}Output: $PROJECT_DIR/output/report.html${NC}"
            echo -e "${CYAN}Size: $FILE_SIZE${NC}"
        fi
    else
        echo ""
        echo -e "${RED}HTML build failed!${NC}"
        return 1
    fi
    
    # Clean up temporary files
    rm -f "$PROJECT_DIR/build.js"
    rm -f "$PROJECT_DIR/convert-md.js"
    rm -f "$PROJECT_DIR/report-template.html"
    rm -f "$PROJECT_DIR/styles.css"
}

# Function to build Markdown report
build_markdown() {
    echo -e "${YELLOW}Building Markdown report...${NC}"
    echo ""
    
    # Copy required file to project dir
    cp "$SKILL_DIR/templates/build-md.js" "$PROJECT_DIR/"
    
    # Run build
    cd "$PROJECT_DIR"
    if "$NODE_CMD" build-md.js; then
        echo ""
        echo -e "${GREEN}✓ Markdown build complete!${NC}"
        
        # Find the generated file
        PROJECT_NAME=$(grep "^Title:" project-info.md | cut -d':' -f2- | xargs || echo "report")
        SAFE_NAME=$(echo "$PROJECT_NAME" | sed 's/[\\/:*?"<>|]/_/g')
        
        if [ -f "$PROJECT_DIR/output/${SAFE_NAME}_report.md" ]; then
            FILE_SIZE=$(du -h "$PROJECT_DIR/output/${SAFE_NAME}_report.md" | cut -f1)
            echo -e "${CYAN}Output: $PROJECT_DIR/output/${SAFE_NAME}_report.md${NC}"
            echo -e "${CYAN}Size: $FILE_SIZE${NC}"
        fi
    else
        echo ""
        echo -e "${RED}Markdown build failed!${NC}"
        return 1
    fi
    
    # Clean up temporary file
    rm -f "$PROJECT_DIR/build-md.js"
}

# Build based on format
SUCCESS=true

if [[ "$OUTPUT_FORMAT" == "html" ]]; then
    build_html || SUCCESS=false
elif [[ "$OUTPUT_FORMAT" == "markdown" || "$OUTPUT_FORMAT" == "md" ]]; then
    build_markdown || SUCCESS=false
elif [[ "$OUTPUT_FORMAT" == "both" ]]; then
    build_html || SUCCESS=false
    echo ""
    build_markdown || SUCCESS=false
fi

# Final output
echo ""
echo -e "${CYAN}===================================${NC}"
if [ "$SUCCESS" = true ]; then
    echo -e "${GREEN}  All builds completed successfully!${NC}"
else
    echo -e "${YELLOW}  Some builds may have failed.${NC}"
fi
echo -e "${CYAN}===================================${NC}"
echo ""
echo -e "${YELLOW}Output files in: $PROJECT_DIR/output/${NC}"
echo ""
