#!/bin/bash

# SPREE Media Manager - Milestone Creation Script
# Usage: ./create-milestone.sh v1.1.0 "Description of milestone"

if [ $# -lt 2 ]; then
    echo "Usage: $0 <version> <description>"
    echo "Example: $0 v1.1.0 \"Added new image editing features\""
    exit 1
fi

VERSION=$1
DESCRIPTION=$2
BRANCH_NAME="milestone-$VERSION"

echo "🎯 Creating milestone: $VERSION"
echo "📝 Description: $DESCRIPTION"
echo ""

# Ensure we're on main and up to date
echo "🔄 Switching to main branch..."
git checkout main
git pull origin main

# Create milestone branch
echo "🌿 Creating milestone branch: $BRANCH_NAME"
git checkout -b $BRANCH_NAME

# Push milestone branch
echo "📤 Pushing milestone branch to GitHub..."
git push -u origin $BRANCH_NAME

# Create and push tag
echo "🏷️  Creating tag: $VERSION-milestone"
git tag -a "$VERSION-milestone" -m "$DESCRIPTION"
git push origin "$VERSION-milestone"

# Return to main
echo "🔙 Returning to main branch..."
git checkout main

echo ""
echo "✅ Milestone created successfully!"
echo "📂 Branch: $BRANCH_NAME"
echo "🏷️  Tag: $VERSION-milestone"
echo "🔗 GitHub: https://github.com/lukemichaelcouk/shopify-media-manager/tree/$BRANCH_NAME"
echo ""
echo "💡 To recover from this milestone later:"
echo "   git checkout $BRANCH_NAME"
echo "   git checkout $VERSION-milestone"
echo "   git diff $BRANCH_NAME  # to see what changed"
