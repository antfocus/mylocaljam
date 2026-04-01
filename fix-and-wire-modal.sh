#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# fix-and-wire-modal.sh
#
# This script does 3 things:
#   1. Reverts the admin page to its last good state (before 3 corrupted commits)
#   2. Adds the EventFormModal import to the top of the admin page
#   3. Removes the inline EventFormModal function from the bottom
#
# Run from your mylocaljam repo root:
#   bash fix-and-wire-modal.sh
# ─────────────────────────────────────────────────────────────────────

set -e

echo "🔧 Step 1: Pulling latest and restoring admin page..."
git checkout -- .
git pull origin main

# Restore admin page to the last good version (commit before the 3 bad ones)
git checkout 4e5ac15a3cb7e03d04ce3824833741f57564a1e9 -- src/app/admin/page.js
echo "✅ Admin page restored to good state"

echo ""
echo "🔧 Step 2: Adding EventFormModal import..."
# Add the import line after 'import { supabase }' (line 6)
sed -i '' '6a\
import EventFormModal from '\''@/components/EventFormModal'\'';
' src/app/admin/page.js 2>/dev/null || \
sed -i '6a\import EventFormModal from '\''@/components/EventFormModal'\'';' src/app/admin/page.js
echo "✅ Import added"

echo ""
echo "🔧 Step 3: Removing inline EventFormModal function..."
# Find the line number where 'function EventFormModal(' starts and delete from there to EOF
START_LINE=$(grep -n '^function EventFormModal(' src/app/admin/page.js | head -1 | cut -d: -f1)
if [ -n "$START_LINE" ]; then
  # Delete from one line before (blank line) to end of file
  PREV_LINE=$((START_LINE - 1))
  # Check if previous line is blank
  PREV_CONTENT=$(sed -n "${PREV_LINE}p" src/app/admin/page.js)
  if [ -z "$PREV_CONTENT" ]; then
    DELETE_FROM=$PREV_LINE
  else
    DELETE_FROM=$START_LINE
  fi
  # Use sed to delete from that line to end
  sed -i '' "${DELETE_FROM},\$d" src/app/admin/page.js 2>/dev/null || \
  sed -i "${DELETE_FROM},\$d" src/app/admin/page.js
  # Add final newline
  echo "" >> src/app/admin/page.js
  echo "✅ Inline EventFormModal removed (was at line $START_LINE)"
else
  echo "⚠️  Could not find inline EventFormModal — it may already be removed"
fi

echo ""
echo "🔧 Step 4: Committing and pushing..."
git add src/app/admin/page.js
git commit -m "refactor: wire EventFormModal import, remove inline version, fix corrupted commits"
git push origin main

echo ""
echo "🎉 Done! The admin page now imports EventFormModal from src/components/EventFormModal.js"
echo "   Run 'git sync' or refresh your Vercel deploy to see changes."
