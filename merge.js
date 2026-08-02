// Line-level three-way merge. One task is one line, so line granularity is
// enough to merge edits made in two places without ids in the file.

function lcsMatch(a, b) {
    // matches[i] = index in b that a[i] corresponds to, or -1.
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j]
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    const matches = new Array(n).fill(-1);
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            matches[i] = j;
            i++; j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            i++;
        } else {
            j++;
        }
    }
    return matches;
}

// Runs of base lines this side changed, in base coordinates, each carrying the
// range of the side's own lines that replaces it. A zero-width base range is a
// pure insertion.
function changeHunks(base, other, match) {
    const hunks = [];
    let i = 0, o = 0;
    while (i < base.length) {
        if (match[i] >= 0) {
            if (match[i] > o) hunks.push({ bs: i, be: i, os: o, oe: match[i] });
            o = match[i] + 1;
            i++;
        } else {
            const bs = i;
            while (i < base.length && match[i] < 0) i++;
            const oe = i < base.length ? match[i] : other.length;
            hunks.push({ bs, be: i, os: o, oe });
            o = oe;
        }
    }
    if (o < other.length) hunks.push({ bs: base.length, be: base.length, os: o, oe: other.length });
    return hunks;
}

const sameLines = (a, b) => a.length === b.length && a.every((line, i) => line === b[i]);

// Returns { clean, text, conflicts }. When clean is false the text carries
// conflict markers and is meant for a human to fix, not to be saved as-is.
export function merge3(baseText, mineText, theirsText, labels = {}) {
    const names = { mine: labels.mine || 'this device', theirs: labels.theirs || 'GitHub' };

    const split = (t) => (t === '' ? [] : t.replace(/\n$/, '').split('\n'));
    const base = split(baseText);
    const mine = split(mineText);
    const theirs = split(theirsText);

    if (sameLines(mine, theirs)) return { clean: true, text: mineText, conflicts: 0 };
    if (sameLines(base, mine)) return { clean: true, text: theirsText, conflicts: 0 };
    if (sameLines(base, theirs)) return { clean: true, text: mineText, conflicts: 0 };

    const mineHunks = changeHunks(base, mine, lcsMatch(base, mine));
    const theirsHunks = changeHunks(base, theirs, lcsMatch(base, theirs));

    const out = [];
    let conflicts = 0;
    let bi = 0, mi = 0, ti = 0;
    let hm = 0, ht = 0;

    while (hm < mineHunks.length || ht < theirsHunks.length) {
        const nm = hm < mineHunks.length ? mineHunks[hm].bs : Infinity;
        const nt = ht < theirsHunks.length ? theirsHunks[ht].bs : Infinity;
        const start = Math.min(nm, nt);

        // Lines before the next change are untouched by either side.
        if (start > bi) {
            out.push(...base.slice(bi, start));
            const span = start - bi;
            mi += span; ti += span; bi = start;
        }

        let end = start;
        let mEnd = mi, tEnd = ti;
        let mCovered = start, tCovered = start;
        let touchedMine = false, touchedTheirs = false;

        // Absorb hunks that overlap this region. Two hunks that merely touch
        // stay separate, so a deletion next to an edit merges cleanly; but two
        // insertions at the same point are pulled in together and conflict.
        for (;;) {
            const canTake = (h) => h && (h.bs < end || (h.bs === end && end === start));
            if (canTake(mineHunks[hm])) {
                const h = mineHunks[hm++];
                end = Math.max(end, h.be);
                mEnd = h.oe; mCovered = h.be;
                touchedMine = true;
                continue;
            }
            if (canTake(theirsHunks[ht])) {
                const h = theirsHunks[ht++];
                end = Math.max(end, h.be);
                tEnd = h.oe; tCovered = h.be;
                touchedTheirs = true;
                continue;
            }
            break;
        }

        // Base lines inside the region that this side left alone map across 1:1.
        mEnd += end - mCovered;
        tEnd += end - tCovered;

        const mineSeg = mine.slice(mi, mEnd);
        const theirsSeg = theirs.slice(ti, tEnd);

        if (!touchedTheirs) {
            out.push(...mineSeg);
        } else if (!touchedMine) {
            out.push(...theirsSeg);
        } else if (sameLines(mineSeg, theirsSeg)) {
            out.push(...mineSeg);
        } else {
            conflicts++;
            out.push(
                `<<<<<<< ${names.mine}`,
                ...mineSeg,
                '=======',
                ...theirsSeg,
                `>>>>>>> ${names.theirs}`,
            );
        }

        bi = end; mi = mEnd; ti = tEnd;
    }

    out.push(...base.slice(bi));

    const text = out.length ? out.join('\n') + '\n' : '';
    return { clean: conflicts === 0, text, conflicts };
}
