// Turns a member's numbers into a readable movie identity: what they watch, how they rate, and a
// name for the pattern. Every trait is derived from their own library; nothing is invented.
const MIN_TITLES_FOR_ARCHETYPE = 5;

const GENRE_PERSONAS = {
    28: "Adrenaline Junkie",
    12: "Explorer",
    16: "Animation Archivist",
    35: "Comedy Connoisseur",
    80: "Noir Detective",
    99: "Truth Seeker",
    18: "Drama Devotee",
    10751: "Family Night Host",
    14: "World Wanderer",
    36: "History Buff",
    27: "Midnight Screamer",
    10402: "Soundtrack Soul",
    9648: "Puzzle Solver",
    10749: "Hopeless Romantic",
    878: "Stargazer",
    53: "Edge-of-Seat Thrill Seeker",
    10752: "War Chronicler",
    37: "Frontier Rider",
    10759: "Adrenaline Junkie",
    10765: "Stargazer",
    10768: "War Chronicler",
    10762: "Family Night Host",
    10764: "Reality Watcher",
    10766: "Soap Opera Loyalist",
    10767: "Talk Show Regular",
    10763: "News Hound"
};

const median = (values) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

// Each trait is a measured tendency strong enough to name. They are ordered by how distinctive
// they are, and the strongest becomes the archetype's adjective.
const deriveTraits = ({ ratingCount, versusTmdb, lesserKnownShare, nonEnglishShare, languageCount, medianYear, seen }) => {
    const traits = [];

    if (ratingCount >= 5 && versusTmdb !== null) {
        if (versusTmdb <= -0.7) {
            traits.push({ key: "exacting", adjective: "Exacting", label: "Tough critic", strength: Math.abs(versusTmdb),
                description: `Rates ${Math.abs(versusTmdb).toFixed(1)} points below TMDB on average` });
        } else if (versusTmdb >= 0.7) {
            traits.push({ key: "generous", adjective: "Big-Hearted", label: "Generous critic", strength: versusTmdb,
                description: `Rates ${versusTmdb.toFixed(1)} points above TMDB on average` });
        } else {
            traits.push({ key: "in_tune", adjective: null, label: "In tune with the crowd", strength: 0.2,
                description: "Ratings land close to the wider audience's" });
        }
    }

    if (seen >= 5 && lesserKnownShare !== null && lesserKnownShare >= 0.35) {
        traits.push({ key: "underground", adjective: "Underground", label: "Hidden-gem hunter", strength: lesserKnownShare * 2,
            description: `${Math.round(lesserKnownShare * 100)}% of their films are lesser-known titles` });
    }

    if (seen >= 5 && (nonEnglishShare >= 0.4 || languageCount >= 5)) {
        traits.push({ key: "globetrotting", adjective: "Globetrotting", label: "World cinema explorer", strength: nonEnglishShare * 2 + languageCount / 10,
            description: `Watches in ${languageCount} languages; ${Math.round(nonEnglishShare * 100)}% not in English` });
    }

    if (seen >= 5 && medianYear !== null && medianYear < 1990) {
        traits.push({ key: "vintage", adjective: "Vintage", label: "Classic cinema lover", strength: (1990 - medianYear) / 15,
            description: `Their typical film is from ${medianYear}` });
    } else if (seen >= 5 && medianYear !== null && medianYear >= new Date().getUTCFullYear() - 4) {
        traits.push({ key: "current", adjective: "Up-to-the-Minute", label: "Keeps up with new releases", strength: 0.6,
            description: `Their typical film is from ${medianYear}` });
    }

    return traits.sort((a, b) => b.strength - a.strength);
};

const buildIdentity = ({ seen, ratingCount, versusTmdb, lesserKnownShare, languages, medianYear, topGenre }) => {
    const englishTitles = languages.find((language) => language.code === "en")?.titles || 0;
    const languageTitles = languages.reduce((sum, language) => sum + language.titles, 0);
    const nonEnglishShare = languageTitles ? 1 - englishTitles / languageTitles : 0;

    const traits = deriveTraits({
        ratingCount,
        versusTmdb,
        lesserKnownShare,
        nonEnglishShare,
        languageCount: languages.length,
        medianYear,
        seen
    });

    if (seen < MIN_TITLES_FOR_ARCHETYPE || !topGenre) {
        return {
            archetype: null,
            progress: { seen, needed: MIN_TITLES_FOR_ARCHETYPE },
            traits: traits.map(({ adjective, strength, ...trait }) => trait)
        };
    }

    const persona = GENRE_PERSONAS[topGenre.id] || `${topGenre.name} Devotee`;
    const adjective = traits.find((trait) => trait.adjective)?.adjective;

    return {
        archetype: adjective ? `The ${adjective} ${persona}` : `The ${persona}`,
        progress: null,
        traits: traits.map(({ adjective: unused, strength, ...trait }) => trait)
    };
};

module.exports = {
    median,
    buildIdentity,
    MIN_TITLES_FOR_ARCHETYPE
};
