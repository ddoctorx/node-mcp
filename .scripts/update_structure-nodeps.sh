#!/bin/bash
# save to .scripts/update_structure.sh
# Generates a folder tree and saves it to a markdown file.
# Best used with tree: `brew install tree`

# Output file
OUTPUT_FILE=".cursor/rules/structure.mdc"

# Create the output file with header
mkdir -p "$(dirname "$OUTPUT_FILE")"  # Ensure the directory exists
echo "# Project Structure" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "\`\`\`" >> "$OUTPUT_FILE"

# Check if tree command is available
if command -v tree &> /dev/null; then
  # Use tree command for better visualization
  tree -a > "$OUTPUT_FILE"
  echo "Using tree command for structure visualization."
else
  # Fallback to the alternative approach if tree is not available
  echo "Tree command not found. Using fallback approach."

  # Define SEDMAGIC for creating the tree-like structure
  SEDMAGIC='s;[^/]*/;|-- ;g;s;-- |;   |;g'

  # Set directory list to argument(s) or current directory
  if [ "$#" -gt 0 ]; then
    dirlist="$@"
  else
    dirlist="."
  fi

  # Generate the tree structure using find and sed
  for dir in $dirlist; do
    find "$dir" -print | sed -e "$SEDMAGIC" >> "$OUTPUT_FILE"
  done
fi

# Close the code block
echo "\`\`\`" >> "$OUTPUT_FILE"

echo "Project structure has been updated in $OUTPUT_FILE"