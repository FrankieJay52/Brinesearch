    /* GitHub #97 — deterministic Google Maps coordinate-route planner.
       The database is the authority for ordered control points. This layer only
       validates that receipt and splits it into conservative iOS-safe URLs. */

    const GOOGLE_ROUTE_MAX_WAYPOINTS_ISSUE97 = 3;
    const GOOGLE_ROUTE_MAX_URL_LENGTH_ISSUE97 = 2048;
    const GOOGLE_ROUTE_POINT_KINDS_ISSUE97 = new Set([
      "junction",
      "shared_entry",
      "shared_exit",
      "shape",
      "pad_destination"
    ]);

    function googleRouteCoordinateValueIssue97(value, minimum, maximum, field) {
      const text = String(value ?? "").trim();
      if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(text)) {
        throw new Error(`Google route ${field} must be a decimal coordinate`);
      }
      const number = Number(text);
      if (!Number.isFinite(number) || number < minimum || number > maximum) {
        throw new Error(`Google route ${field} is outside the valid coordinate range`);
      }
      return Object.is(number, -0) ? "0" : text;
    }

    function googleRouteCoordinateIssue97(point) {
      const latitude = googleRouteCoordinateValueIssue97(point?.latitude, -90, 90, "latitude");
      const longitude = googleRouteCoordinateValueIssue97(point?.longitude, -180, 180, "longitude");
      return `${latitude},${longitude}`;
    }

    function googleRouteHexDigestIssue97(value, field) {
      const digest = String(value ?? "").trim().toLowerCase();
      if (!/^(?:[0-9a-f]{32}|[0-9a-f]{64})$/.test(digest)) {
        throw new Error(`Google route ${field} is missing its authoritative digest`);
      }
      return digest;
    }

    function googleRouteIdentifierIssue97(value, field) {
      const identifier = String(value ?? "").trim();
      if (!identifier) throw new Error(`Google route ${field} is missing`);
      return identifier;
    }

    function googleRouteRevisionIssue97(value, field) {
      const text = String(value ?? "").trim();
      if (!/^[1-9][0-9]*$/.test(text)) {
        throw new Error(`Google route ${field} must be a positive integer`);
      }
      const revision = Number(text);
      if (!Number.isSafeInteger(revision)) {
        throw new Error(`Google route ${field} exceeds the safe integer range`);
      }
      return revision;
    }

    function validateGoogleRoutePointIssue97(point, index, total) {
      if (!point || typeof point !== "object" || Array.isArray(point)) {
        throw new Error(`Google route point ${index + 1} is invalid`);
      }
      const sequence = Number(point.sequence);
      if (!Number.isInteger(sequence) || sequence !== index + 1) {
        throw new Error("Google route point order is not contiguous");
      }
      const kind = String(point.kind || "");
      if (!GOOGLE_ROUTE_POINT_KINDS_ISSUE97.has(kind)) {
        throw new Error(`Google route point ${sequence} has an unsupported role`);
      }
      googleRouteCoordinateIssue97(point);

      if (kind === "pad_destination") {
        if (index !== total - 1 || point.source_kind !== "saved_pad_gps" || !point.pad_id) {
          throw new Error("Google route must end at the exact saved pad GPS receipt");
        }
      } else if (index === total - 1) {
        throw new Error("Google route is missing its final pad destination");
      }

      if (kind === "junction" || kind === "shared_entry" || kind === "shared_exit") {
        if (point.source_kind !== "authoritative_junction_anchor" ||
            !point.anchor_id || !point.junction_id || !point.graph_build_id) {
          throw new Error(`Google route ${kind} point is missing graph provenance`);
        }
        googleRouteHexDigestIssue97(point.graph_digest, "graph digest");
        googleRouteHexDigestIssue97(point.anchor_digest, "anchor digest");
      }

      if (kind === "shape") {
        const sourceSegmentKeys = point.source_segment_keys;
        if (point.source_kind !== "authoritative_clipped_geometry" ||
            !point.occurrence_id || !Array.isArray(sourceSegmentKeys) ||
            sourceSegmentKeys.length === 0 ||
            sourceSegmentKeys.some(key => typeof key !== "string" || !key.trim()) ||
            new Set(sourceSegmentKeys).size !== sourceSegmentKeys.length) {
          throw new Error("Google route shape point is not tied to clipped authoritative geometry");
        }
        googleRouteHexDigestIssue97(point.source_digest, "shape source digest");
      }
      return point;
    }

    function validateGoogleRouteManifestIssue97(manifest) {
      if (!manifest || manifest.route_ready !== true || manifest.status !== "ready") {
        throw new Error("Google route manifest is not route-ready");
      }
      if (String(manifest.manifest_version || "") !== "issue97-google-v1") {
        throw new Error("Google route manifest version is unsupported");
      }
      const padId = googleRouteIdentifierIssue97(manifest.pad_id, "manifest pad ID");
      googleRouteRevisionIssue97(manifest.route_revision, "manifest route revision");
      googleRouteHexDigestIssue97(manifest.manifest_digest, "manifest digest");
      const points = Array.isArray(manifest.points) ? manifest.points : [];
      if (points.length < 2) {
        throw new Error("Google route manifest requires a source-proven route ingress and pad destination");
      }
      points.forEach((point, index) => validateGoogleRoutePointIssue97(point, index, points.length));

      const ingress = points[0];
      if (ingress.kind !== "shape" || ingress.shape_role !== "route_ingress") {
        throw new Error("Google route must start with a source-proven route ingress");
      }
      if (points.slice(1).some(point => point?.shape_role === "route_ingress")) {
        throw new Error("Google route may contain only one route ingress at the first control point");
      }
      const destination = points[points.length - 1];
      if (googleRouteIdentifierIssue97(destination.pad_id, "destination pad ID") !== padId) {
        throw new Error("Google route destination pad does not match its manifest");
      }

      let openSharedJunction = null;
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        if (point.kind === "shared_entry") {
          if (openSharedJunction) throw new Error("Google route shared segment entry is nested");
          openSharedJunction = point.junction_id;
          continue;
        }
        if (point.kind === "shared_exit") {
          if (!openSharedJunction || openSharedJunction !== point.junction_id) {
            throw new Error("Google route shared exit is missing its ordered entry anchor");
          }
          openSharedJunction = null;
          continue;
        }
        if (openSharedJunction && point.kind !== "shape") {
          throw new Error("Google route shared section may contain only source-derived shaping points");
        }
      }
      if (openSharedJunction) throw new Error("Google route shared segment is missing its exit anchor");
      return points;
    }

    function validateGoogleRoutePublicRowIssue97(row) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error("Google route public row is invalid");
      }
      const points = validateGoogleRouteManifestIssue97(row.manifest);
      const rowPadId = googleRouteIdentifierIssue97(row.pad_id, "public row pad ID");
      const manifestPadId = googleRouteIdentifierIssue97(row.manifest.pad_id, "manifest pad ID");
      if (rowPadId !== manifestPadId) {
        throw new Error("Google route public row pad does not match its manifest");
      }
      const rowRevision = googleRouteRevisionIssue97(row.route_revision, "public row route revision");
      const manifestRevision = googleRouteRevisionIssue97(
        row.manifest.route_revision,
        "manifest route revision"
      );
      if (rowRevision !== manifestRevision) {
        throw new Error("Google route public row revision does not match its manifest");
      }
      const destinationPadId = googleRouteIdentifierIssue97(
        points[points.length - 1].pad_id,
        "destination pad ID"
      );
      if (destinationPadId !== rowPadId) {
        throw new Error("Google route public row pad does not match its destination");
      }
      return row.manifest;
    }

    function googleRouteChunkUrlIssue97(origin, destination, waypoints) {
      const params = new URLSearchParams();
      params.set("api", "1");
      params.set("travelmode", "driving");
      params.set("dir_action", "navigate");
      if (origin) params.set("origin", origin);
      params.set("destination", destination);
      if (waypoints.length) params.set("waypoints", waypoints.join("|"));
      const url = `https://www.google.com/maps/dir/?${params.toString()}`;
      if (url.length > GOOGLE_ROUTE_MAX_URL_LENGTH_ISSUE97) {
        throw new Error("Google route chunk exceeds the 2,048-character Maps URL limit");
      }
      return url;
    }

    function buildGoogleRoutePlanIssue97(manifest) {
      const points = validateGoogleRouteManifestIssue97(manifest);
      const chunks = [];
      let consumed = 0;
      let previousDestination = null;

      while (consumed < points.length) {
        const selected = points.slice(
          consumed,
          consumed + GOOGLE_ROUTE_MAX_WAYPOINTS_ISSUE97 + 1
        );
        const destinationPoint = selected[selected.length - 1];
        const waypointPoints = selected.slice(0, -1);
        const origin = previousDestination
          ? googleRouteCoordinateIssue97(previousDestination)
          : null;
        const destination = googleRouteCoordinateIssue97(destinationPoint);
        const waypoints = waypointPoints.map(googleRouteCoordinateIssue97);
        const url = googleRouteChunkUrlIssue97(origin, destination, waypoints);

        chunks.push(Object.freeze({
          chunk: chunks.length + 1,
          origin,
          destination,
          waypoints: Object.freeze(waypoints),
          point_sequences: Object.freeze(selected.map(point => Number(point.sequence))),
          url
        }));
        previousDestination = destinationPoint;
        consumed += selected.length;
      }

      return Object.freeze({
        pad_id: manifest.pad_id,
        route_revision: manifest.route_revision,
        manifest_digest: String(manifest.manifest_digest).toLowerCase(),
        points: Object.freeze(points.slice()),
        chunks: Object.freeze(chunks),
        first_url: chunks[0]?.url || ""
      });
    }

    function buildGoogleRoutePublicPlanIssue97(row) {
      return buildGoogleRoutePlanIssue97(validateGoogleRoutePublicRowIssue97(row));
    }

    globalThis.BrinesearchGoogleRouteIssue97 = Object.freeze({
      maxWaypoints: GOOGLE_ROUTE_MAX_WAYPOINTS_ISSUE97,
      maxUrlLength: GOOGLE_ROUTE_MAX_URL_LENGTH_ISSUE97,
      coordinate: googleRouteCoordinateIssue97,
      validateManifest: validateGoogleRouteManifestIssue97,
      validatePublicRow: validateGoogleRoutePublicRowIssue97,
      buildPlan: buildGoogleRoutePlanIssue97,
      buildPublicPlan: buildGoogleRoutePublicPlanIssue97
    });
