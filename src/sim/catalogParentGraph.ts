interface CatalogParentBody {
  id: string;
  parentId?: string | null;
}

/** Validate topology without changing identity, row order or truthy-parent semantics. */
export function validateCatalogParentGraph(bodies: readonly CatalogParentBody[]): void {
  const bodyById = new Map<string, CatalogParentBody>();
  for (const body of bodies) {
    if (bodyById.has(body.id)) throw new Error('catalog contains duplicate body IDs');
    bodyById.set(body.id, body);
  }

  for (const body of bodies) {
    if (body.parentId && !bodyById.has(body.parentId)) {
      throw new Error('catalog body references a missing parent');
    }
  }

  const complete = new Set<CatalogParentBody>();
  for (const body of bodies) {
    const path = new Set<CatalogParentBody>();
    let current: CatalogParentBody | undefined = body;
    while (current && !complete.has(current)) {
      if (path.has(current)) throw new Error('catalog parent graph contains a cycle');
      path.add(current);
      current = current.parentId ? bodyById.get(current.parentId) : undefined;
    }
    for (const entry of path) complete.add(entry);
  }
}
