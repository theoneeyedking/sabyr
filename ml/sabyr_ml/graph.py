"""Граф получателей (NetworkX): степень вершины, PageRank, близость к помеченным дропам."""
from __future__ import annotations

from typing import Iterable

import networkx as nx

from .features import GRAPH_FAR


def build_graph(edges: Iterable[tuple]) -> nx.DiGraph:
    """`edges` — (отправитель, получатель[, число переводов])."""
    g = nx.DiGraph()
    for e in edges:
        w = e[2] if len(e) > 2 else 1
        if g.has_edge(e[0], e[1]):
            g[e[0]][e[1]]["weight"] += w
        else:
            g.add_edge(e[0], e[1], weight=w)
    return g


def graph_features(g: nx.DiGraph, flagged: Iterable) -> dict:
    """Возвращает {вершина: {in_degree, pagerank, dist_to_drop}}.

    pagerank нормирован на число вершин (1.0 = «средняя» вершина), чтобы признак не зависел
    от размера графа. dist_to_drop — число рёбер (без учёта направления) до ближайшего счёта,
    помеченного дропом; 0 — сам счёт помечен, GRAPH_FAR — далеко или пути нет.
    """
    if g.number_of_nodes() == 0:
        return {}
    n = g.number_of_nodes()
    pr = nx.pagerank(g, alpha=0.85, weight="weight", max_iter=100, tol=1e-6)
    flagged = [f for f in flagged if f in g]
    dist: dict = {}
    if flagged:
        dist = nx.multi_source_dijkstra_path_length(g.to_undirected(as_view=True), flagged,
                                                    cutoff=GRAPH_FAR - 1, weight=None)
    return {
        node: {
            "in_degree": float(g.in_degree(node)),
            "pagerank": float(pr[node] * n),
            "dist_to_drop": float(dist.get(node, GRAPH_FAR)),
        }
        for node in g.nodes
    }
