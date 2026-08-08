    /* Suspended profiles are moderator-controlled. Removed profiles remain
       user-controlled and may be explicitly reactivated. */
    const securityFieldRequireReadyBaseV174 = fieldRequireReady;
    fieldRequireReady = async function securityFieldRequireReadyV174() {
      if (editorSession?.access_token) {
        const confirmed = editorSession.user?.email_confirmed_at || editorSession.user?.confirmed_at;
        if (!confirmed) {
          alert("Verify your email before posting or editing Field Feed content.");
          return false;
        }
        await fieldLoadMyProfile();
        if (fieldMyProfile?.status === "removed") {
          if (!confirm("Your Field Feed profile is deactivated. Reactivate it now?")) return false;
          try {
            await fieldApi("/rest/v1/rpc/field_set_profile_active", {
              method: "POST",
              body: JSON.stringify({ p_active: true })
            });
            await fieldLoadMyProfile();
          } catch (error) {
            alert(error?.message || "The profile could not be reactivated.");
            return false;
          }
        }
        if (fieldMyProfile?.status === "suspended") {
          alert("Your Field Feed profile is suspended. Only a moderator can restore it.");
          return false;
        }
      }
      return securityFieldRequireReadyBaseV174();
    };

    const securityFieldRenderProfilePageBaseV174 = fieldRenderProfilePage;
    fieldRenderProfilePage = async function securityFieldRenderProfilePageV174() {
      await securityFieldRenderProfilePageBaseV174();
      const button = document.getElementById("fpDeactivate");
      if (!button || !fieldMyProfile) return;
      if (fieldMyProfile.status === "removed") {
        button.textContent = "Reactivate profile";
        button.classList.remove("feed-danger");
        button.classList.add("feed-primary");
        button.onclick = async () => {
          try {
            await fieldApi("/rest/v1/rpc/field_set_profile_active", {
              method: "POST",
              body: JSON.stringify({ p_active: true })
            });
            await fieldLoadMyProfile();
            fieldRenderProfilePage();
          } catch (error) {
            alert(error?.message || "The profile could not be reactivated.");
          }
        };
      } else if (fieldMyProfile.status === "suspended") {
        button.textContent = "Suspended — moderator required";
        button.disabled = true;
        button.onclick = null;
      }
    };
