{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "candidate_profile": {
      "$ref": "profile.schema.json"
    },
    "extraction_report": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "input_source_ids": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "uniqueItems": true
        },
        "processed_input_blocks": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "uniqueItems": true
        },
        "unprocessed_input_blocks": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "uniqueItems": true
        },
        "unmapped_passages": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "source_id": {
                "type": "string",
                "minLength": 1
              },
              "locator": {
                "type": "string",
                "minLength": 1
              },
              "quote": {
                "type": "string",
                "minLength": 1
              },
              "reason": {
                "type": "string",
                "minLength": 1
              }
            },
            "required": [
              "source_id",
              "locator",
              "quote",
              "reason"
            ]
          }
        },
        "warnings": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "uniqueItems": true
        },
        "needs_user_review": {
          "const": true
        }
      },
      "required": [
        "input_source_ids",
        "processed_input_blocks",
        "unprocessed_input_blocks",
        "unmapped_passages",
        "warnings",
        "needs_user_review"
      ]
    }
  },
  "required": [
    "candidate_profile",
    "extraction_report"
  ],
  "$schema": "https://json-schema.org/draft/2020-12/schema"
}
