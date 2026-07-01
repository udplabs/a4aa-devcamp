# Auth0 Management API — Required M2M Scopes

All scopes required by `AUTH0_MGMT_CLIENT_ID` / `AUTH0_MGMT_CLIENT_SECRET` across the demo app.

## Provisioning (`server/platform/auth0Management.js`, `provision.js`)

| Scope | Endpoint(s) | Used for |
|---|---|---|
| `read:resource_servers` | `GET /resource-servers` | Check if API exists before create |
| `create:resource_servers` | `POST /resource-servers` | Create backend API + MCP API resource servers |
| `delete:resource_servers` | `DELETE /resource-servers/{id}` | Teardown |
| `read:clients` | `GET /clients` | List clients, look up CIMD app by name |
| `create:clients` | `POST /clients` | Create SPA, CIBA client |
| `update:clients` | `PATCH /clients/{id}` | Reconfigure SPA callbacks/origins (platform path only) |
| `delete:clients` | `DELETE /clients/{id}` | Teardown SPA, CIBA, CIMD clients |
| `create:client_grants` | `POST /client-grants` | Grant SPA → MCP API, CIBA → MCP/backend APIs |
| `read:connections` | `GET /connections` | Look up CRM OAuth2 connection |
| `create:connections` | `POST /connections` | Create CRM OAuth2 connection |
| `delete:connections` | `DELETE /connections/{id}` | Teardown CRM connection |
| `read:users` | `GET /users-by-email`, `GET /users/{id}` | Look up demo users by email |
| `create:users` | `POST /users` | Create alice + bob demo users |
| `delete:users` | `DELETE /users/{id}` | Teardown demo users |
| `read:roles` | `GET /roles` | Find Nexus User role by name |
| `create:roles` | `POST /roles` | Create Nexus User role |
| `update:roles` | `POST /roles/{id}/permissions` | Add MCP + backend permissions to role |
| `delete:roles` | `DELETE /roles/{id}` | Teardown Nexus User role |
| `create:role_members` | `POST /users/{id}/roles` | Assign Nexus User role to alice + bob |
| `read:actions` | `GET /actions/actions`, `GET /actions/triggers/post-login/bindings` | Check if action exists; read current bindings |
| `create:actions` | `POST /actions/actions`, `POST /actions/actions/{id}/deploy` | Create + deploy post-login MFA action |
| `update:actions` | `PATCH /actions/triggers/post-login/bindings` | Bind/unbind action from post-login trigger |
| `delete:actions` | `DELETE /actions/actions/{id}` | Teardown MFA action |
| `update:guardian_factors` | `PUT /guardian/factors/push-notification` | Enable/disable Guardian push factor |
| `update:tenant_settings` | `PATCH /tenants/settings` | Enable/disable `customize_mfa_in_postlogin_action` |

## Verification endpoints (`server/index.js`)

| Scope | Endpoint(s) | Used for |
|---|---|---|
| `read:clients` | `GET /clients?external_client_id=...` | Module 01: verify CIMD client registered |
| `read:clients` | `GET /clients/{id}?fields=...` | Module 01: verify OBO client config; Module 03: Token Vault grant on OBO client; Module 04: CIBA grant + channels |
| `read:client_grants` | `GET /client-grants?client_id=...&audience=...` | Module 01: verify user-delegated OBO grant + scopes; Module 03: verify SPA authorized for Auth0 My Account API Connected Accounts scopes |
| `read:connections` | `GET /connections?name=...` | Module 03: verify Token Vault purpose on CRM connection |
| `read:users` | `GET /users-by-email`, `GET /users/{id}/enrollments` | Module 04: look up alice + check her Guardian push enrollments |
| `read:tenant_settings` | `GET /tenants/settings` | Module 02: verify `customize_mfa_in_postlogin_action` is enabled |

## Scopes granted but currently unused — safe to omit unless the code below is revived

| Scope | Why it's in older docs/checklists | Status |
|---|---|---|
| `update:client_grants` | Would back a `PATCH /client-grants/{id}` auto-fix for the OBO grant's scope array | No such call exists anywhere in the codebase — verification only reports the mismatch and tells the user to fix it in the Dashboard |
| `read:role_members` | Would back `GET /roles/{id}/users` / `GET /roles/{id}/permissions` role-assignment verification | No such call exists — no module currently verifies role assignment via the Management API |
| `update:mfa_policies` | `setMfaPolicyAlways`/`resetMfaPolicy` in `auth0Management.js` (`PUT /guardian/policies`) | Defined and imported into `provision.js` but never invoked — MFA enforcement is done via the per-client post-login Action instead (see `update:actions` above), not a tenant-wide policy |

## Full scope list (copy-paste for M2M client configuration)

```
read:resource_servers
create:resource_servers
delete:resource_servers
read:clients
create:clients
update:clients
delete:clients
read:client_grants
create:client_grants
read:connections
create:connections
delete:connections
read:users
create:users
delete:users
read:roles
create:roles
update:roles
delete:roles
create:role_members
read:actions
create:actions
update:actions
delete:actions
update:guardian_factors
update:tenant_settings
read:tenant_settings
```
