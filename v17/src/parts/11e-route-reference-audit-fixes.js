    /* BrineSearch V17.3.10 — mileage audit presentation fixes.
       Pad-specific measurements are distinct from saved driver mileage. They use
       official Ohio DOT public-road centerlines and remain explicitly approximate
       whenever a small unmapped connector is part of the audited result. */

    const driverRouteReferenceLabelBeforeV17310 = driverRouteReferenceLabelV1736;
    driverRouteReferenceLabelV1736 = function driverRouteReferenceLabelAuditV17310(ref) {
      const status = normalize(ref?.status).toLowerCase();
      const source = normalize(ref?.source_label).toLowerCase();
      if (status === "verified_approximate" && /pad-specific.*measurement|ohio dot.*centerline/.test(source)) {
        return "MEASURED APPROX. MILEAGE";
      }
      return driverRouteReferenceLabelBeforeV17310(ref);
    };

    const driverRouteReferenceDistanceMeaningBeforeV17310 = driverRouteReferenceDistanceMeaningV1736;
    driverRouteReferenceDistanceMeaningV1736 = function driverRouteReferenceDistanceMeaningAuditV17310(ref) {
      const mode = normalize(ref?.distance_mode).toLowerCase();
      if (mode === "pad_specific_official_centerline_measurement") {
        return "Pad-specific approach measured on official public-road centerlines";
      }
      return driverRouteReferenceDistanceMeaningBeforeV17310(ref);
    };

    const driverRouteReferenceMessageBeforeV17310 = driverRouteReferenceMessageV1736;
    driverRouteReferenceMessageV1736 = function driverRouteReferenceMessageAuditV17310(ref) {
      const source = normalize(ref?.source_label).toLowerCase();
      if (/pad-specific.*measurement|ohio dot.*centerline/.test(source)) {
        return "Measured for this pad from official Ohio DOT public-road centerlines. A small unmapped connector is allowed only within the audit limit, so the total stays labeled approximate.";
      }
      return driverRouteReferenceMessageBeforeV17310(ref);
    };
