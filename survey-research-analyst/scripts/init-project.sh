#!/bin/bash

# Survey Research Analyst - Project Initialization Script
# Usage: bash init-project.sh -n "ProjectName" -t "market"
# Compatible with: Git Bash (Windows), macOS Terminal, Linux

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
PROJECT_NAME=""
REPORT_TYPE=""

# Function to show usage
show_usage() {
    echo "Usage: bash init-project.sh -n <project_name> -t <report_type>"
    echo ""
    echo "Report Types:"
    echo "  market      - Market Research"
    echo "  competitor  - Competitor Analysis"
    echo "  user        - User Research"
    echo "  industry    - Industry Trends"
    echo "  technology  - Technology Research"
    echo "  policy      - Policy Analysis"
    echo ""
    echo "Example:"
    echo "  bash init-project.sh -n \"MyProject\" -t \"market\""
}

# Parse arguments
while getopts "n:t:h" opt; do
    case $opt in
        n)
            PROJECT_NAME="$OPTARG"
            ;;
        t)
            REPORT_TYPE="$OPTARG"
            ;;
        h)
            show_usage
            exit 0
            ;;
        \?)
            echo "Invalid option: -$OPTARG" >&2
            show_usage
            exit 1
            ;;
    esac
done

# Validate arguments
if [ -z "$PROJECT_NAME" ] || [ -z "$REPORT_TYPE" ]; then
    echo -e "${RED}Error: Project name and report type are required${NC}"
    show_usage
    exit 1
fi

# Validate report type
VALID_TYPES="market competitor user industry technology policy"
if [[ ! " $VALID_TYPES " =~ " $REPORT_TYPE " ]]; then
    echo -e "${RED}Error: Invalid report type '$REPORT_TYPE'${NC}"
    echo "Valid types: $VALID_TYPES"
    exit 1
fi

# Get current directory and script directory
PROJECT_PATH="$(pwd)/$PROJECT_NAME"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

# Check if directory already exists
if [ -d "$PROJECT_PATH" ]; then
    echo -e "${RED}Error: Directory '$PROJECT_NAME' already exists${NC}"
    exit 1
fi

echo -e "${CYAN}===================================${NC}"
echo -e "${CYAN}  Survey Report Project Init${NC}"
echo -e "${CYAN}===================================${NC}"
echo ""

echo -e "${GREEN}Creating project structure...${NC}"

# Create directory structure
mkdir -p "$PROJECT_PATH/docs"
mkdir -p "$PROJECT_PATH/research"
mkdir -p "$PROJECT_PATH/sources"
mkdir -p "$PROJECT_PATH/output"

# Get current date
CURRENT_DATE=$(date +%Y-%m-%d)

# Map report type to name
case $REPORT_TYPE in
    market)
        TYPE_NAME="Market Research"
        ;;
    competitor)
        TYPE_NAME="Competitor Analysis"
        ;;
    user)
        TYPE_NAME="User Research"
        ;;
    industry)
        TYPE_NAME="Industry Trends"
        ;;
    technology)
        TYPE_NAME="Technology Research"
        ;;
    policy)
        TYPE_NAME="Policy Analysis"
        ;;
esac

echo -e "${GREEN}Creating project config...${NC}"

# Create project-info.md
cat > "$PROJECT_PATH/project-info.md" << EOF
# Project Info

## Basic Info
- Title: $PROJECT_NAME
- Subtitle: $TYPE_NAME Report
- Type: $TYPE_NAME
- Version: 1.0.0
- Created: $CURRENT_DATE

## Research Goals
(To be filled: describe research objectives and expected outputs)

## Core Questions
(To be filled: list 3-5 core questions to answer)

## Execution Mode
- [ ] Quick Mode (30 min, <=10 searches)
- [ ] Standard Mode (1-2 hours, <=20 searches)

## Progress Tracking
- [ ] Wave 1: Information Collection
- [ ] Wave 2: Analysis Writing
- [ ] Wave 3: Deep Analysis
- [ ] Integration Build

## Reference Framework
- Type: $REPORT_TYPE
- Framework Doc: references/frameworks/$REPORT_TYPE.md
EOF

echo -e "${GREEN}Creating document templates...${NC}"

# Function to create chapter file
create_chapter() {
    local file="$1"
    local title="$2"
    cat > "$PROJECT_PATH/docs/$file" << EOF
---
title: $title
---

# $title

(Write $title content here)

## Key Points

- Point 1
- Point 2
- Point 3

## Data Support

(Add relevant data and sources)

## Analysis Insights

(Add deep analysis)
EOF
}

# Create chapters based on report type
case $REPORT_TYPE in
    market)
        create_chapter "01-executive-summary.md" "Executive Summary"
        create_chapter "02-market-size.md" "Market Size"
        create_chapter "03-competition.md" "Competitive Landscape"
        create_chapter "04-user-needs.md" "User Needs"
        create_chapter "05-entry-strategy.md" "Entry Strategy"
        create_chapter "06-risk-assessment.md" "Risk Assessment"
        create_chapter "07-conclusions.md" "Conclusions"
        ;;
    competitor)
        create_chapter "01-executive-summary.md" "Executive Summary"
        create_chapter "02-competitor-overview.md" "Competitor Overview"
        create_chapter "03-feature-comparison.md" "Feature Comparison"
        create_chapter "04-swot-analysis.md" "SWOT Analysis"
        create_chapter "05-differentiation.md" "Differentiation Strategy"
        create_chapter "06-conclusions.md" "Conclusions"
        ;;
    user)
        create_chapter "01-executive-summary.md" "Executive Summary"
        create_chapter "02-user-personas.md" "User Personas"
        create_chapter "03-needs-analysis.md" "Needs Analysis"
        create_chapter "04-behavior-insights.md" "Behavior Insights"
        create_chapter "05-pain-points.md" "Pain Points & Opportunities"
        create_chapter "06-conclusions.md" "Conclusions"
        ;;
    industry)
        create_chapter "01-executive-summary.md" "Executive Summary"
        create_chapter "02-industry-status.md" "Industry Status"
        create_chapter "03-tech-trends.md" "Technology Trends"
        create_chapter "04-market-direction.md" "Market Direction"
        create_chapter "05-future-forecast.md" "Future Forecast"
        create_chapter "06-conclusions.md" "Conclusions"
        ;;
    technology)
        create_chapter "01-executive-summary.md" "Executive Summary"
        create_chapter "02-tech-overview.md" "Technology Overview"
        create_chapter "03-solution-comparison.md" "Solution Comparison"
        create_chapter "04-feasibility.md" "Feasibility Analysis"
        create_chapter "05-implementation.md" "Implementation Advice"
        create_chapter "06-conclusions.md" "Conclusions"
        ;;
    policy)
        create_chapter "01-executive-summary.md" "Executive Summary"
        create_chapter "02-policy-background.md" "Policy Background"
        create_chapter "03-policy-keypoints.md" "Policy Key Points"
        create_chapter "04-impact-analysis.md" "Impact Analysis"
        create_chapter "05-compliance.md" "Compliance Advice"
        create_chapter "06-conclusions.md" "Conclusions"
        ;;
esac

# Create key findings file
cat > "$PROJECT_PATH/docs/00-key-findings.md" << EOF
---
title: Key Findings
---

# Key Findings

## Finding 1

(Describe key finding)

## Finding 2

(Describe key finding)

## Finding 3

(Describe key finding)
EOF

# Create sources file
cat > "$PROJECT_PATH/sources/sources.md" << EOF
# Data Sources

## Level A (Official/Authoritative)

| Source | Type | Usage | Date |
|--------|------|-------|------|
| Source 1 | Government | Data support | $CURRENT_DATE |

## Level B (Media/Think Tanks)

| Source | Type | Usage | Date |
|--------|------|-------|------|
| Source 1 | Industry Report | Trend analysis | $CURRENT_DATE |

## Level C (Blogs/Forums)

| Source | Type | Usage | Date |
|--------|------|-------|------|
| Source 1 | Tech Blog | Technical details | $CURRENT_DATE |
EOF

# Copy rebuild.sh to project directory
echo -e "${GREEN}Copying rebuild script...${NC}"
if [ -f "$SCRIPT_DIR/rebuild.sh" ]; then
    cp "$SCRIPT_DIR/rebuild.sh" "$PROJECT_PATH/"
    chmod +x "$PROJECT_PATH/rebuild.sh"
fi

echo ""
echo -e "${GREEN}===================================${NC}"
echo -e "${GREEN}  Project Init Complete!${NC}"
echo -e "${GREEN}===================================${NC}"
echo ""
echo -e "${CYAN}Project Path: $PROJECT_PATH${NC}"
echo -e "${CYAN}Report Type: $TYPE_NAME${NC}"
echo ""
echo -e "${YELLOW}Directory Structure:${NC}"
echo "  $PROJECT_NAME/"
echo "  ├── docs/          # Report documents (Markdown)"
echo "  ├── research/      # Research materials"
echo "  ├── sources/       # Source list"
echo "  ├── output/        # Output directory"
echo "  ├── project-info.md # Project config"
echo "  └── rebuild.sh     # Rebuild script"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Edit project-info.md to complete project info"
echo "  2. Reference framework: references/frameworks/$REPORT_TYPE.md"
echo "  3. Start Wave 1: Information Collection"
echo "  4. Write chapters in docs/ directory"
echo "  5. Build HTML report:"
echo -e "     ${CYAN}bash rebuild.sh${NC}"
echo ""
