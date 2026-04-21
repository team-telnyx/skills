# Porting Orders

> Check portability, create port-in orders, upload supporting documents, track requirements, and manage port-out activity.

## Prerequisites

- Telnyx API key ([get one free](https://telnyx.com/agent-signup.md))
- Phone numbers in E.164 format (e.g. `+13125550001`)
- Account details from the losing carrier when creating a porting order

## Quick Start

```bash
# 1) Check whether numbers are portable
curl -X POST "https://api.telnyx.com/v2/portability_checks" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_numbers": ["+13125550001", "+13125550002"]}'

# 2) Create a draft porting order
curl -X POST "https://api.telnyx.com/v2/porting_orders" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_numbers": ["+13125550001", "+13125550002"],
    "customer_name": "Acme Corp",
    "authorized_person": "Jane Doe",
    "billing_phone_number": "+13125550000",
    "old_service_provider": "AT&T"
  }'

# 3) Inspect order requirements
curl "https://api.telnyx.com/v2/porting_orders/{id}/requirements" \
  -H "Authorization: Bearer $TELNYX_API_KEY"

# 4) Submit the order
curl -X POST "https://api.telnyx.com/v2/porting_orders/{id}/actions/confirm" \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

## API Reference

### Check Portability

**`POST /v2/portability_checks`**

```bash
curl -X POST "https://api.telnyx.com/v2/portability_checks" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_numbers": ["+13125550001"]}'
```

```python
import requests

resp = requests.post(
    "https://api.telnyx.com/v2/portability_checks",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={"phone_numbers": ["+13125550001"]},
)
print(resp.json())
```

```typescript
const response = await fetch("https://api.telnyx.com/v2/portability_checks", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ phone_numbers: ["+13125550001"] }),
});
console.log(await response.json());
```

### Create a Porting Order

**`POST /v2/porting_orders`**

```bash
curl -X POST "https://api.telnyx.com/v2/porting_orders" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_numbers": ["+13125550001", "+13125550002"],
    "customer_name": "Acme Corp",
    "authorized_person": "Jane Doe",
    "billing_phone_number": "+13125550000",
    "old_service_provider": "AT&T"
  }'
```

### Get / Update / Delete

**`GET /v2/porting_orders/{id}`**

```bash
curl "https://api.telnyx.com/v2/porting_orders/{id}" \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

**`PATCH /v2/porting_orders/{id}`**

```bash
curl -X PATCH "https://api.telnyx.com/v2/porting_orders/{id}" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"customer_reference": "customer-123", "description": "Main office migration"}'
```

**`DELETE /v2/porting_orders/{id}`**

```bash
curl -X DELETE "https://api.telnyx.com/v2/porting_orders/{id}" \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

### Submit / Cancel / Activate

**Submit:** `POST /v2/porting_orders/{id}/actions/confirm`

```bash
curl -X POST "https://api.telnyx.com/v2/porting_orders/{id}/actions/confirm" \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

**Cancel:** `POST /v2/porting_orders/{id}/actions/cancel`

```bash
curl -X POST "https://api.telnyx.com/v2/porting_orders/{id}/actions/cancel" \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

**Activate (US FastPort):** `POST /v2/porting_orders/{id}/actions/activate`

```bash
curl -X POST "https://api.telnyx.com/v2/porting_orders/{id}/actions/activate" \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

### Requirements, Documents, and Comments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/porting_orders/{id}/requirements` | GET | List requirements for the order |
| `/v2/porting_orders/{id}/allowed_foc_windows` | GET | Allowed FOC date windows |
| `/v2/porting_orders/{id}/additional_documents` | GET | List uploaded documents |
| `/v2/porting_orders/{id}/additional_documents` | POST | Upload a supporting document |
| `/v2/porting_orders/{id}/comments` | GET | List comments |
| `/v2/porting_orders/{id}/comments` | POST | Add a comment |
| `/v2/porting_orders/{id}/activation_jobs` | GET | List activation jobs |
| `/v2/porting_orders/{id}/events` | GET | List order events |

### Port-Out Orders

List and inspect port-out activity on the account:

```bash
# List port-out orders
curl "https://api.telnyx.com/v2/portout_orders" \
  -H "Authorization: Bearer $TELNYX_API_KEY"

# Get a specific port-out order
curl "https://api.telnyx.com/v2/portout_orders/{id}" \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/portout_orders` | GET | List port-out orders |
| `/v2/portout_orders/{id}` | GET | Get a port-out order |
| `/v2/portout_orders/{id}/comments` | GET | List comments |
| `/v2/portout_orders/{id}/comments` | POST | Add a comment |
| `/v2/portout_orders/{id}/documents` | GET | List documents |
| `/v2/portout_orders/{id}/documents` | POST | Upload a document |
| `/v2/portout_orders/rejection_codes` | GET | List rejection codes |
| `/v2/portout/events` | GET | List port-out events |

### CLI Quick Path

```bash
# One-command guided porting workflow
telnyx-agent setup-porting --phone-numbers +13125550001,+13125550002 --customer-name "Acme Corp"

# Include submission
telnyx-agent setup-porting --phone-numbers +13125550001,+13125550002 --customer-name "Acme Corp" --submit
```
