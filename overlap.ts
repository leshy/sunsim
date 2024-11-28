import * as THREE from "npm:three";
import { ConvexGeometry } from "npm:three/addons/geometries/ConvexGeometry.js";

export function removeOverlappingVertices(
    lowResGeometry: THREE.BufferGeometry,
    highResGeometry: THREE.BufferGeometry,
    threshold = 0.1,
): THREE.BufferGeometry {
    const debugElements = [];

    const hull = new ConvexGeometry(
        Array.from(
            { length: highResGeometry.attributes.position.count },
            (_, i) =>
                new THREE.Vector3().fromBufferAttribute(
                    highResGeometry.attributes.position,
                    i,
                ),
        ),
    );
    hull.scale(1 + threshold, 1 + threshold, 1 + threshold);
    const hullMesh = new THREE.Mesh(hull);

    const oldPositions = lowResGeometry.attributes.position;
    const indices = lowResGeometry.index
        ? Array.from(lowResGeometry.index.array)
        : null;
    const keptVertices = new Set<number>();

    // Find vertices to keep
    for (let i = 0; i < oldPositions.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(oldPositions, i);

        if (Math.random() > 0.8) {
            const { isInside, debugObjects } = isPointInMeshWithDebug(
                vertex,
                hullMesh,
            );
            if (!isInside) {
                keptVertices.add(i);
            }
            for (const obj of debugObjects) {
                debugElements.push(obj);
            }
        } else {
            if (!isPointInMesh(vertex, hullMesh)) {
                keptVertices.add(i);
            }
        }
    }

    // Create vertex mapping
    const oldToNew = new Map<number, number>();
    let newIndex = 0;
    Array.from(keptVertices).forEach((i) => {
        oldToNew.set(i, newIndex++);
    });

    // Create new geometry with preserved attributes
    const newGeometry = new THREE.BufferGeometry();

    // Copy all attributes
    Object.entries(lowResGeometry.attributes).forEach(([name, attribute]) => {
        const itemSize = attribute.itemSize;
        const newArray = new Float32Array(keptVertices.size * itemSize);

        Array.from(keptVertices).forEach((oldIdx, newIdx) => {
            for (let i = 0; i < itemSize; i++) {
                newArray[newIdx * itemSize + i] =
                    attribute.array[oldIdx * itemSize + i];
            }
        });

        newGeometry.setAttribute(
            name,
            new THREE.BufferAttribute(newArray, itemSize),
        );
    });

    // Update indices if they exist
    if (indices) {
        const newIndices: number[] = [];
        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i];
            const b = indices[i + 1];
            const c = indices[i + 2];

            if (
                keptVertices.has(a) &&
                keptVertices.has(b) &&
                keptVertices.has(c)
            ) {
                newIndices.push(
                    oldToNew.get(a)!,
                    oldToNew.get(b)!,
                    oldToNew.get(c)!,
                );
            }
        }
        newGeometry.setIndex(newIndices);
    }

    return [newGeometry, debugElements];
}

function isPointInMesh(point: THREE.Vector3, mesh: THREE.Mesh): boolean {
    // Create a raycaster
    const raycaster = new THREE.Raycaster();

    // Cast ray up (positive Z)
    const rayUp = new THREE.Vector3(0, 0, 1);
    raycaster.set(point, rayUp);
    const intersectionsUp = raycaster.intersectObject(mesh);

    // Cast ray down (negative Z)
    const rayDown = new THREE.Vector3(0, 0, -1);
    raycaster.set(point, rayDown);
    const intersectionsDown = raycaster.intersectObject(mesh);

    // If point is inside mesh, we should have odd number of intersections in either direction
    const totalIntersections =
        intersectionsUp.length + intersectionsDown.length;
    return totalIntersections % 2 === 1;
}

function isPointInMeshWithDebug(
    point: THREE.Vector3,
    mesh: THREE.Mesh,
): {
    isInside: boolean;
    debugObjects: THREE.Object3D[];
} {
    const debugObjects: THREE.Object3D[] = [];

    // Setup raycasting
    const raycaster = new THREE.Raycaster();
    const rayDown = new THREE.Vector3(0, 0, 1);
    raycaster.set(point, rayDown);

    const intersections = raycaster.intersectObject(mesh);

    if (intersections.length === 0) {
        return { isInside: false, debugObjects };
    }

    const intersection = intersections[0];

    // Add intersection point marker
    const hitGeometry = new THREE.SphereGeometry(10);
    const hitMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const hitMarker = new THREE.Mesh(hitGeometry, hitMaterial);
    hitMarker.position.copy(intersection.point);
    debugObjects.push(hitMarker);

    // Add ray line
    const rayGeometry = new THREE.BufferGeometry().setFromPoints([
        point,
        intersection.point,
    ]);
    if (point.z > intersection.point.z) {
        const rayLine = new THREE.Line(
            rayGeometry,
            new THREE.LineBasicMaterial({
                color: 0x00ff00,
            }),
        );
        debugObjects.push(rayLine);
    }

    return {
        isInside: point.z > intersection.point.z,
        debugObjects,
    };
}
