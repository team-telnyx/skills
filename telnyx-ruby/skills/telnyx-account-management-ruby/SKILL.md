---
name: telnyx-account-management-ruby
description: >-
  Sub-account management for reseller and enterprise scenarios.
metadata:
  author: telnyx
  product: account-management
  language: ruby
  generated_by: telnyx-ext-skills-generator
---

<!-- Auto-generated from Telnyx OpenAPI specs. Do not edit. -->

# Telnyx Account Management - Ruby

## Core Workflow

### Prerequisites

1. Managed account features must be enabled on your account

### Steps

1. **Create sub-account**: `client.managed_accounts.create(...: ...)`
2. **List sub-accounts**: `client.managed_accounts.list()`

### Common mistakes

- Sub-accounts are fully isolated — they have their own API keys, numbers, and billing

**Related skills**: telnyx-account-ruby

## Installation

```bash
gem install telnyx
```

## Setup

```ruby
require "telnyx"

client = Telnyx::Client.new(
  api_key: ENV["TELNYX_API_KEY"], # This is the default and can be omitted
)
```

All examples below assume `client` is already initialized as shown above.

## Error Handling

All API calls can fail with network errors, rate limits (429), validation errors (422),
or authentication errors (401). Always handle errors in production code:

```ruby
begin
  result = client.managed_accounts.list(params)
rescue Telnyx::Errors::APIConnectionError
  puts "Network error — check connectivity and retry"
rescue Telnyx::Errors::RateLimitError
  # 429: rate limited — wait and retry with exponential backoff
  sleep(1) # Check Retry-After header for actual delay
rescue Telnyx::Errors::APIStatusError => e
  puts "API error #{e.status}: #{e.message}"
  if e.status == 422
    puts "Validation error — check required fields and formats"
  end
end
```

Common error codes: `401` invalid API key, `403` insufficient permissions,
`404` resource not found, `422` validation error (check field formats),
`429` rate limited (retry with exponential backoff).

## Important Notes

- **Pagination:** Use `.auto_paging_each` for automatic iteration: `page.auto_paging_each { |item| puts item.id }`.

**[references/api-details.md](references/api-details.md) has complete response schemas, all optional parameters, and webhook payload fields. You MUST read it when accessing response fields or using optional parameters not shown below.**

## Lists accounts managed by the current user.

Lists the accounts managed by the current user. Users need to be explictly approved by Telnyx in order to become manager accounts.

`GET /managed_accounts`

```ruby
page = client.managed_accounts.list

puts(page)
```

Key response fields: `response.data.id, response.data.created_at, response.data.updated_at`

## Create a new managed account.

Create a new managed account owned by the authenticated user. You need to be explictly approved by Telnyx in order to become a manager account.

`client.managed_accounts.create()` — `POST /managed_accounts`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `business_name` | string | Yes | The name of the business for which the new managed account i... |
| ... | | | +4 optional params in [references/api-details.md](references/api-details.md) |

```ruby
managed_account = client.managed_accounts.create(business_name: "Larry's Cat Food Inc")

puts(managed_account)
```

Key response fields: `response.data.id, response.data.created_at, response.data.updated_at`

## Display information about allocatable global outbound channels for the current user.

Display information about allocatable global outbound channels for the current user. Only usable by account managers.

`GET /managed_accounts/allocatable_global_outbound_channels`

```ruby
response = client.managed_accounts.get_allocatable_global_outbound_channels

puts(response)
```

Key response fields: `response.data.allocatable_global_outbound_channels, response.data.managed_account_allow_custom_pricing, response.data.record_type`

## Retrieve a managed account

Retrieves the details of a single managed account.

`client.managed_accounts.retrieve()` — `GET /managed_accounts/{id}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Managed Account User ID |

```ruby
managed_account = client.managed_accounts.retrieve("550e8400-e29b-41d4-a716-446655440000")

puts(managed_account)
```

Key response fields: `response.data.id, response.data.created_at, response.data.updated_at`

## Update a managed account

Update a single managed account.

`client.managed_accounts.update()` — `PATCH /managed_accounts/{id}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Managed Account User ID |
| ... | | | +1 optional params in [references/api-details.md](references/api-details.md) |

```ruby
managed_account = client.managed_accounts.update("550e8400-e29b-41d4-a716-446655440000")

puts(managed_account)
```

Key response fields: `response.data.id, response.data.created_at, response.data.updated_at`

## Disables a managed account

Disables a managed account, forbidding it to use Telnyx services, including sending or receiving phone calls and SMS messages. Ongoing phone calls will not be affected. The managed account and its sub-users will no longer be able to log in via the mission control portal.

`client.managed_accounts.actions.disable()` — `POST /managed_accounts/{id}/actions/disable`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Managed Account User ID |

```ruby
response = client.managed_accounts.actions.disable("550e8400-e29b-41d4-a716-446655440000")

puts(response)
```

Key response fields: `response.data.id, response.data.created_at, response.data.updated_at`

## Enables a managed account

Enables a managed account and its sub-users to use Telnyx services.

`client.managed_accounts.actions.enable()` — `POST /managed_accounts/{id}/actions/enable`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Managed Account User ID |
| ... | | | +1 optional params in [references/api-details.md](references/api-details.md) |

```ruby
response = client.managed_accounts.actions.enable("550e8400-e29b-41d4-a716-446655440000")

puts(response)
```

Key response fields: `response.data.id, response.data.created_at, response.data.updated_at`

## Update the amount of allocatable global outbound channels allocated to a specific managed account.

`client.managed_accounts.update_global_channel_limit()` — `PATCH /managed_accounts/{id}/update_global_channel_limit`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Managed Account User ID |
| ... | | | +1 optional params in [references/api-details.md](references/api-details.md) |

```ruby
response = client.managed_accounts.update_global_channel_limit("550e8400-e29b-41d4-a716-446655440000")

puts(response)
```

Key response fields: `response.data.id, response.data.channel_limit, response.data.email`

## List organization users

Returns a list of the users in your organization.

`GET /organizations/users`

```ruby
page = client.organizations.users.list

puts(page)
```

Key response fields: `response.data.id, response.data.created_at, response.data.email`

## Get organization users groups report

Returns a report of all users in your organization with their group memberships. This endpoint returns all users without pagination and always includes group information. The report can be retrieved in JSON or CSV format by sending specific content-type headers.

`GET /organizations/users/users_groups_report`

```ruby
response = client.organizations.users.get_groups_report

puts(response)
```

Key response fields: `response.data.id, response.data.created_at, response.data.email`

## Get organization user

Returns a user in your organization.

`client.organizations.users.retrieve()` — `GET /organizations/users/{id}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Organization User ID |

```ruby
user = client.organizations.users.retrieve("550e8400-e29b-41d4-a716-446655440000")

puts(user)
```

Key response fields: `response.data.id, response.data.created_at, response.data.email`

## Delete organization user

Deletes a user in your organization.

`client.organizations.users.actions.remove()` — `POST /organizations/users/{id}/actions/remove`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Organization User ID |

```ruby
action = client.organizations.users.actions.remove("550e8400-e29b-41d4-a716-446655440000")

puts(action)
```

Key response fields: `response.data.id, response.data.created_at, response.data.email`

---

**Do not guess response field names or optional parameters. Load [references/api-details.md](references/api-details.md) for complete schemas and parameter details.**
