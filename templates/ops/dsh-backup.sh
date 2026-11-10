#!/bin/sh
# Dated backup of a dsh home folder. It only READS the source; it writes only inside --dest.
#
#   dsh-backup.sh --dest <DIR> [--source <DIR>] [--keep N] [--max-attachment-mb N]
#                 [--include-profile-config] [--dry-run]
#
# Result: <DEST>/dsh-YYYY-MM-DD (built as a .partial folder and renamed when complete),
# then all but the newest N such folders are removed from <DEST>.
#
# Left out of the copy:
#   - dsh-runtimes/ and every node_modules/ (large, rebuildable)
#   - attachments larger than --max-attachment-mb (default 25)
#   - profile config files (profiles/*/cordis.patch.yml, cordis.yml, package.json), because they can
#     hold plaintext keys or tokens; --include-profile-config copies them and prints a warning
# Session logs are copied as they are: they hold whatever was said in your conversations.
set -eu

src=${DSH_HOME:-$HOME/.dsh}
dest=""
keep=14
maxmb=25
withconfig=0
dry=0

usage() { sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
die() { echo "dsh-backup: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case $1 in
    --dest) [ $# -ge 2 ] || usage; dest=$2; shift 2 ;;
    --source) [ $# -ge 2 ] || usage; src=$2; shift 2 ;;
    --keep) [ $# -ge 2 ] || usage; keep=$2; shift 2 ;;
    --max-attachment-mb) [ $# -ge 2 ] || usage; maxmb=$2; shift 2 ;;
    --include-profile-config) withconfig=1; shift ;;
    --dry-run) dry=1; shift ;;
    -h|--help) usage ;;
    *) echo "dsh-backup: unknown option $1" >&2; usage ;;
  esac
done

[ -n "$dest" ] || { echo "dsh-backup: --dest is required (nothing is preset)" >&2; usage; }
case $keep in ''|*[!0-9]*) die "--keep must be a whole number" ;; esac
[ "$keep" -ge 1 ] || die "--keep must be at least 1"
case $maxmb in ''|*[!0-9]*) die "--max-attachment-mb must be a whole number" ;; esac
case $dest in /*) ;; *) die "--dest must be an absolute path" ;; esac
[ -d "$src" ] || die "source folder not found: $src"
mkdir -p "$dest" 2>/dev/null || die "cannot create $dest"
srcp=$(cd -P "$src" && pwd) || die "cannot read $src"
destp=$(cd -P "$dest" && pwd) || die "cannot read $dest"
case "$destp/" in "$srcp"/*) die "--dest must not be inside the source folder" ;; esac
case "$srcp/" in "$destp"/*) die "the source folder must not be inside --dest" ;; esac
[ "$destp" != "/" ] || die "refusing / as destination"

date=${DSH_BACKUP_DATE:-$(date +%Y-%m-%d)}
case $date in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;; *) die "bad date $date" ;; esac
name="dsh-$date"
final="$destp/$name"
partial="$destp/.$name.partial"

work=$(mktemp -d "${TMPDIR:-/tmp}/dsh-backup.XXXXXX")
lock="$destp/.dsh-backup.lock"
cleanup() { rm -rf "$work"; [ "${haslock:-0}" = 1 ] && rmdir "$lock" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# Rules for rsync (anchored at the source folder).
{
  echo "/dsh-runtimes/"
  echo "node_modules/"
  echo "*.partial"
  if [ "$withconfig" = 0 ]; then
    echo "/profiles/*/cordis.patch.yml"
    echo "/profiles/*/cordis.yml"
    echo "/profiles/*/package.json"
  fi
} >"$work/excludes"
if [ -d "$srcp/attachments" ]; then
  find "$srcp/attachments" -type f -size "+${maxmb}M" 2>/dev/null | while IFS= read -r f; do
    rel=${f#"$srcp"}
    printf '%s\n' "$rel" | sed 's/[][*?\\]/\\&/g'
  done >>"$work/excludes"
fi
bigcount=$(awk '/^\/attachments\//{n++} END{print n+0}' "$work/excludes")

if [ "$dry" = 1 ]; then
  echo "dsh-backup (dry run): would copy $srcp to $final"
  echo "  excluded: dsh-runtimes, node_modules, ${bigcount} attachment(s) over ${maxmb} MB$( [ "$withconfig" = 0 ] && echo ', profile config files' )"
  echo "  keep newest $keep dated folders in $destp"
  exit 0
fi

mkdir "$lock" 2>/dev/null || die "another backup is running (or remove $lock if it is stale)"
haslock=1

rm -rf "$partial"
mkdir -m 700 "$partial"
rsync -a --exclude-from="$work/excludes" "$srcp/" "$partial/" || { rm -rf "$partial"; die "copy failed"; }
{
  echo "dsh backup $date"
  echo "source: $srcp"
  echo "excluded: dsh-runtimes, node_modules, attachments over ${maxmb} MB ($bigcount left out)$( [ "$withconfig" = 0 ] && echo ', profile config files' )"
  [ "$withconfig" = 1 ] && echo "profile config files INCLUDED: they may hold plaintext keys or tokens"
} >"$partial/BACKUP-INFO.txt"

# Replace a backup of the same day, only ever our own dated folder.
if [ -d "$final" ] && [ ! -L "$final" ]; then rm -rf "$final"; fi
mv "$partial" "$final"

# Keep the newest $keep dated folders. Only exact dsh-YYYY-MM-DD directories directly in dest.
count=0
for d in $(ls -1 "$destp" | grep -E '^dsh-[0-9]{4}-[0-9]{2}-[0-9]{2}$' | sort -r); do
  count=$((count + 1))
  if [ "$count" -gt "$keep" ]; then
    [ -d "$destp/$d" ] && [ ! -L "$destp/$d" ] && rm -rf "$destp/$d" && echo "dsh-backup: removed old $d"
  fi
done

echo "dsh-backup: wrote $final"
if [ "$withconfig" = 1 ]; then
  echo "dsh-backup: WARNING profile config files were included; they may hold plaintext keys or tokens, so $destp should not be a synced or shared folder." >&2
fi
