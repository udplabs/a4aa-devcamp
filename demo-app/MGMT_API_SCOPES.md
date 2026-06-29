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
| `update:clients` | `PATCH /clients/{id}` | Reconfigure SPA callbacks/origins |
| `delete:clients` | `DELETE /clients/{id}` | Teardown SPA, CIBA, CIMD clients |
| `read:client_grants` | `GET /client-grants` | Verify OBO user-delegated grant |
| `create:client_grants` | `POST /client-grants` | Grant SPA → backend API, CIBA → APIs |
| `update:client_grants` | `PATCH /client-grants/{id}` | Fix OBO grant scope array |
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
| `read:role_members` | `GET /roles/{id}/users`, `GET /roles/{id}/permissions` | Verify role assignments + permissions |
| `create:role_members` | `POST /users/{id}/roles` | Assign Nexus User role to alice + bob |
| `read:actions` | `GET /actions/actions`, `GET /actions/triggers/post-login/bindings` | Check if action exists; read current bindings |
| `create:actions` | `POST /actions/actions`, `POST /actions/actions/{id}/deploy` | Create + deploy post-login MFA action |
| `update:actions` | `PATCH /actions/triggers/post-login/bindings` | Bind/unbind action from post-login trigger |
| `delete:actions` | `DELETE /actions/actions/{id}` | Teardown MFA action |

## Verification endpoints (`server/index.js`)

| Scope | Endpoint(s) | Used for |
|---|---|---|
| `read:clients` | `GET /clients?external_client_id=...` | Module 01: verify CIMD client registered |
| `read:clients` | `GET /clients/{id}?fields=...` | Module 01: verify OBO client config; Module 03: Token Vault grant; Module 04: CIBA grant + channels |
| `update:clients` | `PATCH /clients/{id}` | Module 01: patch OBO token_exchange if not set |
| `read:client_grants` | `GET /client-grants?client_id=...&audience=...` | Module 01: verify user-delegated OBO grant + scopes |
| `update:client_grants` | `PATCH /client-grants/{id}` | Module 01: auto-fix OBO grant scope array |
| `read:connections` | `GET /connections?name=...` | Module 03: verify Token Vault purpose on CRM connection |
| `read:roles` | `GET /roles`, `GET /roles/{id}/permissions`, `GET /roles/{id}/users` | Module 01: verify Nexus User role has MCP permissions + is assigned |
| `read:users` | `GET /users-by-email`, `GET /users/{id}/enrollments` | Module 04: look up alice + check her Guardian push enrollments |
| `update:guardian_factors` | `PUT /guardian/factors/push-notification` | Provisioning: enable Guardian push factor |
| `update:mfa_policies` | `PUT /guardian/policies` | Provisioning: set MFA policy to always |

## Full scope list (copy-paste for M2M client configuration)

```
read:resource_servers
create:resource_servers
delete:resource_servers
read:clients
create:clients
update:clients
delete:clients
read:client_grants          # required for obo_user_grant verify check
create:client_grants
update:client_grants
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
read:role_members
create:role_members
read:actions
create:actions
update:actions
delete:actions
update:guardian_factors
update:mfa_policies
```
