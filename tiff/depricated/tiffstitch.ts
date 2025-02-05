import * as THREE from "npm:three"

export function findBoundaryVertices(geometry: THREE.BufferGeometry): number[] {
    const indices = geometry.index!.array
    const vertexUsage = new Map<number, number>()

    // Count vertex usage in triangles
    for (let i = 0; i < indices.length; i++) {
        const idx = indices[i]
        vertexUsage.set(idx, (vertexUsage.get(idx) || 0) + 1)
    }

    // Get boundary vertices (those used less than 6 times)
    const boundaryIndices = Array.from(vertexUsage.entries())
        .filter(([_, count]) => count < 6)
        .map(([idx, _]) => idx)

    console.log("Boundary vertices count:", boundaryIndices.length)
    return boundaryIndices
}

export function visualizeBoundary(geom2: THREE.BufferGeometry) {
    // Test findOuterBoundary
    const boundaryIndices = findBoundaryVertices(geom2)

    // Visualize the boundary by either:
    // 1. Creating a line loop
    const boundaryPositions = boundaryIndices.flatMap((idx) => {
        const pos = geom2.attributes.position.array
        return [pos[idx * 3], pos[idx * 3 + 1], pos[idx * 3 + 2]]
    })
    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(boundaryPositions, 3),
    )
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 })
    const boundaryLine = new THREE.LineLoop(lineGeometry, lineMaterial)

    return boundaryLine
}

export function stitchGeometries(
    geom1: THREE.BufferGeometry,
    geom2: THREE.BufferGeometry,
) {
    const boundaryIndices = findBoundaryVertices(geom2)
    const pos1 = geom1.attributes.position.array
    const pos2 = geom2.attributes.position.array

    // Store matches for each boundary vertex
    const matches: Array<{ geom2Idx: number; geom1Idx: number; dist: number }> =
        []

    // Find closest vertex in geom1 for each boundary vertex
    for (const idx2 of boundaryIndices) {
        const p2 = {
            x: pos2[idx2 * 3],
            z: pos2[idx2 * 3 + 2],
        }

        let minDist = Infinity
        let closest = -1
        for (let j = 0; j < pos1.length; j += 3) {
            const dist = Math.hypot(pos1[j] - p2.x, pos1[j + 2] - p2.z)
            if (dist < minDist) {
                minDist = dist
                closest = j / 3
            }
        }

        matches.push({
            geom2Idx: idx2,
            geom1Idx: closest,
            dist: minDist,
        })
    }

    console.log("Total matches found:", matches.length)
    // Let's look at the distribution of distances
    const dists = matches.map((m) => m.dist)
    console.log("Min distance:", Math.min(...dists))
    console.log("Max distance:", Math.max(...dists))
    console.log("Avg distance:", dists.reduce((a, b) => a + b) / dists.length)

    // First attempt at triangles: connect each boundary vertex to its match
    // and the next vertex's match
    const newTriangles: number[] = []
    const vertexOffset = pos1.length / 3 // offset for geom2 vertices

    for (let i = 0; i < matches.length; i++) {
        const curr = matches[i]
        const next = matches[(i + 1) % matches.length]

        // Try two triangles between the four points
        newTriangles.push(
            curr.geom1Idx,
            curr.geom2Idx + vertexOffset,
            next.geom1Idx,
            next.geom1Idx,
            curr.geom2Idx + vertexOffset,
            next.geom2Idx + vertexOffset,
        )
    }

    return newTriangles
}

export function mergeTerrainGeometries(
    geom1: THREE.BufferGeometry,
    geom2: THREE.BufferGeometry,
): THREE.BufferGeometry {
    // First get stitching triangles
    const stitchingTriangles = stitchGeometries(geom1, geom2)

    // Merge vertex attributes
    const pos1 = geom1.attributes.position.array
    const pos2 = geom2.attributes.position.array
    const mergedPositions = new Float32Array(pos1.length + pos2.length)
    mergedPositions.set(pos1, 0)
    mergedPositions.set(pos2, pos1.length)

    // Merge indices
    const indices1 = geom1.index!.array
    const indices2 = geom2.index!.array
    const vertexOffset = pos1.length / 3

    // Calculate total size needed for indices
    const totalIndices = indices1.length + indices2.length +
        stitchingTriangles.length
    const mergedIndices = new (
        totalIndices > 65535 ? Uint32Array : Uint16Array
    )(totalIndices)

    // Copy original indices
    mergedIndices.set(indices1, 0)
    // Copy second geometry indices with offset
    for (let i = 0; i < indices2.length; i++) {
        mergedIndices[indices1.length + i] = indices2[i] + vertexOffset
    }
    // Add stitching triangles
    mergedIndices.set(stitchingTriangles, indices1.length + indices2.length)

    // Create merged geometry
    const mergedGeometry = new THREE.BufferGeometry()
    mergedGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(mergedPositions, 3),
    )
    mergedGeometry.setIndex(new THREE.BufferAttribute(mergedIndices, 1))
    mergedGeometry.computeVertexNormals()

    return mergedGeometry
}
