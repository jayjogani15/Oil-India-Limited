"""
Precursor Pattern Clustering Engine.

Clusters HSSE reports using TF-IDF + K-Means to surface recurring:
- Activity patterns
- Location/site clusters
- Barrier failure modes
- Root cause groupings

Also provides trend detection: weekly SIF-density shifts per cluster.
"""

from collections import defaultdict, Counter
from datetime import datetime, timedelta


def get_cluster_engine():
    """Return a cluster engine — uses sklearn if available, else simple freq-based."""
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.cluster import KMeans
        return SklearnClusterEngine()
    except ImportError:
        return SimpleClusterEngine()


class SimpleClusterEngine:
    """
    Fallback clustering using keyword-based category grouping.
    No sklearn required — works in any environment.
    """

    CLUSTER_DEFINITIONS = {
        "Electrical & Isolation Failures": [
            "energized", "loto", "lockout", "electrical", "panel", "switchgear",
            "isolation", "de-energized", "live wire", "hv", "arc flash"
        ],
        "Hot Work & Fire/Explosion Risk": [
            "welding", "hot work", "cutting", "grinding", "spark", "flame",
            "fire", "explosion", "flammable", "gas test", "hydrocarbon", "lel"
        ],
        "Confined Space Entry": [
            "confined space", "tank entry", "vessel entry", "manhole", "pit",
            "oxygen", "h2s", "atmospheric", "scba", "standby", "entrapment"
        ],
        "Working at Height / Fall Risk": [
            "height", "scaffold", "ladder", "harness", "fall", "roof",
            "elevated", "derrick", "mast", "anchor", "lanyard"
        ],
        "Lifting & Crane Operations": [
            "crane", "lifting", "rigging", "sling", "shackle", "swl",
            "overload", "hoist", "load", "winch", "hook"
        ],
        "Vehicle & Road Safety": [
            "vehicle", "driving", "driver", "road", "collision", "seatbelt",
            "speed", "forklift", "reverse", "banksman", "pedestrian"
        ],
        "Safety Control Bypass": [
            "bypass", "defeated", "overridden", "interlock", "alarm disabled",
            "guard removed", "safety system", "unauthorized", "trip bypassed"
        ],
        "Permit & Procedure Failures": [
            "permit to work", "ptw", "no permit", "jsa", "toolbox talk",
            "procedure", "authorization", "work order", "unauthorized"
        ]
    }

    def fit_predict(self, texts: list[str], metadata: list[dict]) -> list[dict]:
        """Assign each text to best-matching cluster."""
        results = []
        for i, text in enumerate(texts):
            text_lower = text.lower()
            best_cluster = "General / Housekeeping"
            best_score = 0

            for cluster_name, keywords in self.CLUSTER_DEFINITIONS.items():
                score = sum(1 for kw in keywords if kw in text_lower)
                if score > best_score:
                    best_score = score
                    best_cluster = cluster_name

            results.append({
                "report_index": i,
                "cluster": best_cluster,
                "cluster_score": best_score,
                "metadata": metadata[i] if i < len(metadata) else {}
            })
        return results

    def get_cluster_summary(self, cluster_assignments: list[dict], all_texts: list[str]) -> list[dict]:
        """Summarize each cluster with counts, SIF rate, and label."""
        from collections import defaultdict

        cluster_groups = defaultdict(list)
        for item in cluster_assignments:
            cluster_groups[item["cluster"]].append(item)

        summaries = []
        for cluster_name, items in cluster_groups.items():
            sif_count = sum(
                1 for it in items
                if it.get("metadata", {}).get("sif_potential", False)
            )
            total = len(items)
            sif_rate = sif_count / total if total > 0 else 0

            # Top sites in cluster
            sites = Counter(
                it.get("metadata", {}).get("site", "Unknown")
                for it in items
            )

            summaries.append({
                "cluster_name": cluster_name,
                "report_count": total,
                "sif_count": sif_count,
                "sif_rate": round(sif_rate, 3),
                "top_sites": dict(sites.most_common(3)),
                "risk_level": "critical" if sif_rate >= 0.7 else "high" if sif_rate >= 0.4 else "medium" if sif_rate >= 0.2 else "low"
            })

        summaries.sort(key=lambda s: s["sif_rate"], reverse=True)
        return summaries


class SklearnClusterEngine:
    """
    TF-IDF + K-Means clustering using scikit-learn.
    Better accuracy when sklearn is available.
    """

    def __init__(self, n_clusters: int = 8):
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.cluster import KMeans

        self.n_clusters = n_clusters
        self._vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            max_features=3000,
            min_df=1,
            stop_words="english"
        )
        self._kmeans = KMeans(
            n_clusters=n_clusters,
            random_state=42,
            n_init=10
        )
        self._cluster_labels = {}
        self._fitted = False

    def fit_predict(self, texts: list[str], metadata: list[dict]) -> list[dict]:
        X = self._vectorizer.fit_transform(texts)
        labels = self._kmeans.fit_predict(X)
        self._fitted = True

        # Auto-label clusters by top TF-IDF terms
        feature_names = self._vectorizer.get_feature_names_out()
        centers = self._kmeans.cluster_centers_
        for cluster_id in range(self.n_clusters):
            top_indices = centers[cluster_id].argsort()[-5:][::-1]
            top_terms = [feature_names[i] for i in top_indices]
            self._cluster_labels[cluster_id] = " | ".join(top_terms)

        results = []
        for i, label in enumerate(labels):
            results.append({
                "report_index": i,
                "cluster_id": int(label),
                "cluster": self._cluster_labels.get(int(label), f"Cluster {label}"),
                "metadata": metadata[i] if i < len(metadata) else {}
            })
        return results

    def get_cluster_summary(self, cluster_assignments: list[dict], all_texts: list[str]) -> list[dict]:
        cluster_groups = defaultdict(list)
        for item in cluster_assignments:
            cluster_groups[item.get("cluster_id", item.get("cluster"))].append(item)

        summaries = []
        for cluster_id, items in cluster_groups.items():
            sif_count = sum(1 for it in items if it.get("metadata", {}).get("sif_potential", False))
            total = len(items)
            sif_rate = sif_count / total if total > 0 else 0
            sites = Counter(it.get("metadata", {}).get("site", "Unknown") for it in items)
            label = items[0]["cluster"] if items else f"Cluster {cluster_id}"

            summaries.append({
                "cluster_name": label,
                "cluster_id": cluster_id,
                "report_count": total,
                "sif_count": sif_count,
                "sif_rate": round(sif_rate, 3),
                "top_sites": dict(sites.most_common(3)),
                "risk_level": "critical" if sif_rate >= 0.7 else "high" if sif_rate >= 0.4 else "medium" if sif_rate >= 0.2 else "low"
            })

        summaries.sort(key=lambda s: s["sif_rate"], reverse=True)
        return summaries


def compute_sif_density(
    reports: list[dict],
    group_by: str = "site"
) -> list[dict]:
    """
    Compute SIF precursor density grouped by a field (site, department, activity, etc.)
    
    Returns sorted list of {group, total, sif_count, sif_density, avg_score}
    """
    groups = defaultdict(list)
    for r in reports:
        key = r.get(group_by, "Unknown")
        groups[key].append(r)

    result = []
    for group_name, group_reports in groups.items():
        total = len(group_reports)
        sif_reports = [r for r in group_reports if r.get("sif_potential", False)]
        sif_count = len(sif_reports)
        avg_score = (
            sum(r.get("sif_score", 0) for r in group_reports) / total
            if total > 0 else 0
        )
        result.append({
            "group": group_name,
            "total_reports": total,
            "sif_count": sif_count,
            "sif_density": round(sif_count / total, 3) if total > 0 else 0,
            "avg_sif_score": round(avg_score, 1),
            "risk_level": "critical" if sif_count / max(total, 1) >= 0.6 else
                         "high" if sif_count / max(total, 1) >= 0.35 else
                         "medium" if sif_count / max(total, 1) >= 0.15 else "low"
        })

    result.sort(key=lambda x: x["sif_density"], reverse=True)
    return result


def compute_weekly_trends(reports: list[dict], weeks: int = 8) -> list[dict]:
    """
    Compute weekly SIF density over the past N weeks.
    Reports must have a 'date' field in YYYY-MM-DD format.
    """
    now = datetime.now()
    weekly_data = []

    for week_offset in range(weeks - 1, -1, -1):
        week_start = now - timedelta(weeks=week_offset + 1)
        week_end = now - timedelta(weeks=week_offset)

        week_reports = []
        for r in reports:
            try:
                report_date = datetime.strptime(r["date"], "%Y-%m-%d")
                if week_start <= report_date < week_end:
                    week_reports.append(r)
            except (KeyError, ValueError):
                pass

        total = len(week_reports)
        sif_count = sum(1 for r in week_reports if r.get("sif_potential", False))

        weekly_data.append({
            "week_start": week_start.strftime("%Y-%m-%d"),
            "week_end": week_end.strftime("%Y-%m-%d"),
            "total_reports": total,
            "sif_count": sif_count,
            "sif_density": round(sif_count / total, 3) if total > 0 else 0
        })

    return weekly_data
