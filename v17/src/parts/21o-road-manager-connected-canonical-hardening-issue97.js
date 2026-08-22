    /* GitHub #97 — harden source-road -> canonical Road Manager handoff.
       A canonical UUID stored on a graph membership is historical build evidence.
       Before an Owner enters editable canonical-road UI, prove that the exact
       source identity is still CURRENTLY verified to that canonical road.
       Editors stay on the read-only authoritative source identity. */

    const roadOfficialWireConnectionActionsIssue97Base = roadOfficialWireConnectionActionsIssue97;

    async function roadOfficialCurrentCanonicalMappingVerifiedIssue97(membership) {
      const canonicalId = String(membership?.canonical_road_id || "").trim();
      const identityId = String(membership?.identity_id || "").trim();
      if (!canonicalId || !identityId) return false;

      if (membership.current_mapping_status === "verified") return true;
      if (membership.current_mapping_status && membership.current_mapping_status !== "verified") return false;

      try {
        const payload = await roadOfficialRpcIssue97("brinesearch_authoritative_identities_for_road", {
          p_road_id: canonicalId
        });
        const identities = Array.isArray(payload?.identities) ? payload.identities : [];
        return identities.some(row => row?.identity_id === identityId && row?.mapping_status === "verified");
      } catch {
        return false;
      }
    }

    roadOfficialWireConnectionActionsIssue97 = function roadOfficialWireConnectionActionsHardenedIssue97(host) {
      roadOfficialWireConnectionActionsIssue97Base(host);
      host.querySelectorAll("[data-road-official-open-connected]").forEach(button => {
        button.onclick = async () => {
          const identityId = String(button.dataset.roadOfficialOpenConnected || "").trim();
          const membership = roadOfficialConnectionRowsIssue97
            .flatMap(connection => Array.isArray(connection?.memberships) ? connection.memberships : [])
            .find(row => row?.identity_id === identityId) || null;
          const canonicalId = String(membership?.canonical_road_id || "").trim();

          if (canonicalId && editorIsOwner()) {
            const mappingVerified = await roadOfficialCurrentCanonicalMappingVerifiedIssue97(membership);
            if (mappingVerified) {
              let canonical = (Array.isArray(roadManagerRows) ? roadManagerRows : [])
                .find(row => row.id === canonicalId);
              if (!canonical) {
                try {
                  const rows = await editorRequest(`/rest/v1/brinesearch_roads?select=*&id=eq.${encodeURIComponent(canonicalId)}&limit=1`, { method: "GET" });
                  canonical = Array.isArray(rows) ? rows[0] : null;
                } catch (error) {
                  showToast(error?.message || "Could not load the verified canonical Road Manager road");
                  return;
                }
              }
              if (!canonical) {
                showToast("The verified canonical Road Manager road is unavailable");
                return;
              }
              await switchRoadManagerTabV173("roads");
              renderRoadForm(canonical);
              document.getElementById("roadManagerEditor")?.scrollIntoView({ behavior: "smooth", block: "start" });
              return;
            }
            showToast("Canonical mapping changed or is no longer verified; opening the authoritative source road instead");
          }

          await switchRoadManagerTabV173("official");
          await roadOfficialOpenIdentityIssue97(identityId);
        };
      });
    };
