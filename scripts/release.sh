#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Navigate to project root
cd "$(dirname "$0")/.."

# Get current version from package.json
CURRENT_VERSION=$(grep '"version"' package.json | sed 's/.*"version": "\([^"]*\)".*/\1/')
echo -e "${BLUE}Current version: ${YELLOW}v${CURRENT_VERSION}${NC}"

# Parse version parts
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Determine bump type
BUMP_TYPE=${1:-patch}

case $BUMP_TYPE in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
  *)
    echo -e "${RED}Usage: $0 [major|minor|patch]${NC}"
    echo "  major: 0.1.1 → 1.0.0"
    echo "  minor: 0.1.1 → 0.2.0"
    echo "  patch: 0.1.1 → 0.1.2 (default)"
    exit 1
    ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
TAG_NAME="v${NEW_VERSION}"

echo -e "${GREEN}New version: ${YELLOW}${TAG_NAME}${NC}"

# Check if tag already exists
if git tag -l "$TAG_NAME" | grep -q "$TAG_NAME"; then
  echo -e "${RED}Error: Tag ${TAG_NAME} already exists!${NC}"
  exit 1
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Update package.json
echo -e "${BLUE}Updating package.json...${NC}"
sed -i "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" package.json

# Commit the version bump
echo -e "${BLUE}Committing version bump...${NC}"
git add package.json
git commit -m "chore: bump version to ${NEW_VERSION}"

# Create and push tag
echo -e "${BLUE}Creating tag ${TAG_NAME}...${NC}"
git tag "$TAG_NAME"

echo -e "${BLUE}Pushing commits and tag...${NC}"
git push
git push origin "$TAG_NAME"

# Create GitHub release with auto-generated notes
echo -e "${BLUE}Creating GitHub release...${NC}"
if command -v gh &> /dev/null; then
  gh release create "$TAG_NAME" \
    --title "$TAG_NAME" \
    --generate-notes \
    --target "$(git rev-parse --abbrev-ref HEAD)"
  echo -e "${GREEN}✓ Release ${TAG_NAME} created successfully!${NC}"
  echo -e "${BLUE}View at: ${YELLOW}https://github.com/muhammedaksam/easiarr/releases/tag/${TAG_NAME}${NC}"
else
  echo -e "${YELLOW}GitHub CLI (gh) not installed. Tag pushed but release not created.${NC}"
  echo -e "Install with: ${BLUE}sudo apt install gh${NC} or ${BLUE}brew install gh${NC}"
  echo -e "Then run: ${BLUE}gh release create ${TAG_NAME} --generate-notes${NC}"
fi
