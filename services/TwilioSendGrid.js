// services/TwilioSendGrid.js
require("dotenv").config();

// Import the SendGrid mail module
const sgMail = require("@sendgrid/mail");

// Import the SendGrid client module
const sgClient = require("@sendgrid/client");

// Import the email template map configuration
const { EmailTemplateMap: EMAIL_TEMPLATE_MAP } = require("../config/emailTemplatesMap.js");

// Throw error if required SendGrid environment variables are missing
if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_SENDER_ID) {
  throw new Error(
    "Missing required environment variables: SENDGRID_API_KEY and/or SENDGRID_SENDER_ID"
  );
}

// Set the API key for SendGrid mail
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Set the API key for SendGrid client
sgClient.setApiKey(process.env.SENDGRID_API_KEY);

class TwilioSendGrid {
  // Cache for email templates
  static templateCache = null;

  // Cache for custom field mappings
  static fieldMapCache = null;

  // Cache for contact lists
  static listCache = null;

  // ------------------------------
  // Mapping
  // ------------------------------

  /**
   * Loads the email template configuration from cache or source map.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @returns {Object} The cached or loaded email template configuration.
   */
  static loadEmailTemplateConfig() {
    if (!this.templateCache) {
      // Assign template map to cache if not already cached
      this.templateCache = EMAIL_TEMPLATE_MAP;
    }
    return this.templateCache;
  }

  /**
 * Validates if a given string is a proper email address.
 *
 * @param {string} email - The email string to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
  static _isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Builds a map of custom field types from email template configurations.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @returns {Object} A map of field keys to their respective types.
   * @throws {Error} If a template config is missing `customFieldTypes`.
   */
  static buildFieldTypeFromEmailTemplateConfig() {
    if (this.fieldMapCache) return this.fieldMapCache;

    // Load email template configuration
    const map = this.loadEmailTemplateConfig();

    // Build and cache the field map from template configurations
    this.fieldMapCache = Object.values(map).reduce((acc, t) => {
      // Throw error if template lacks custom field types
      if (!t.customFieldTypes) {
        throw new Error(
          `Missing customFieldTypes in template config for ${t.templateId}`
        );
      }

      // Map each custom field to its type
      for (const [key, type] of Object.entries(t.customFieldTypes)) {
        acc[key] = type;
      }

      return acc;
    }, {});

    return this.fieldMapCache;
  }

  // ------------------------------
  // Subscribe, Unsubscribe, Remove
  // ------------------------------

  /**
   * Removes a recipient from all sender lists in SendGrid.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @param {string} email - The email address of the recipient to remove.
   * @returns {Object} An object indicating successful removal.
   * @throws {Error} If the email is invalid or the recipient is not found.
   */
  static async removeRecipientFromAllSenderLists(email) {
    // Validate the email format
    if (!this._isValidEmail(email)) {
      throw new Error(`Invalid email format: ${email}`);
    }

    // Query SendGrid for contact by email
    const [contactRes] = await sgClient.request({
      method: "POST",
      url: "/v3/marketing/contacts/search",
      body: { query: `email = '${email}'` },
    });

    // Extract the first matching contact
    const contact = contactRes.body.result?.[0];
    if (!contact) {
      // Throw error if contact is not found
      throw new Error(`Recipient not found for removal: ${email}`);
    }

    // Remove the contact from all sender lists
    await sgClient.request({
      method: "PUT",
      url: "/v3/marketing/contacts",
      body: {
        contacts: [{ id: contact.id, list_ids: [] }],
      },
    });

    // Return success confirmation
    return { removed: true };
  }

  /**
   * Subscribes or unsubscribes a recipient from a sender list and verifies custom field updates.
   *
   * @since 1.0
   * @version 1.0
   * @author AI & Linden May
   * @param {string} email - The email address of the recipient.
   * @param {string} listId - The ID of the sender list.
   * @param {Object} [customFields={}] - Custom fields to apply or clear.
   * @param {boolean} subscribe - Whether to subscribe or unsubscribe the recipient.
   * @returns {Promise<Object>} The response body from SendGrid.
   * @throws {Error} If the email is invalid, the update fails, or field validation does not pass.
   */
  static async subscribeOrUnsubscribeRecipientFromSenderListByTag(
    email,
    listId,
    customFields = {},
    subscribe
  ) {
    // Validate the email format
    if (!this._isValidEmail(email)) {
      throw new Error(`Invalid email format: ${email}`);
    }

    // Construct contact payload for subscription or field update
    const payload = {
      contacts: [
        {
          email,
          list_ids: subscribe ? [listId] : undefined, // Only include list_ids if subscribing
          custom_fields: subscribe
            ? customFields
            : Object.fromEntries(
              Object.keys(customFields).map((key) => [key, null])
            ),
        },
      ],
    };

    try {
      // Send request to update contact
      const [res] = await sgClient.request({
        method: "PUT",
        url: "/v3/marketing/contacts",
        body: payload,
      });

      // Re-fetch contact to verify updates
      const [checkRes] = await sgClient.request({
        method: "POST",
        url: "/v3/marketing/contacts/search",
        body: { query: `email = '${email}'` },
      });

      // Extract updated contact
      const contact = checkRes.body.result?.[0];
      if (!contact) throw new Error("Contact not found after update.");

      // Validate custom field values
      for (const [field, value] of Object.entries(customFields)) {
        const current = contact.custom_fields?.[field];

        if (subscribe && current !== value) {
          throw new Error(`Field '${field}' was not set to '${value}'`);
        }

        if (!subscribe && current !== null && current !== undefined) {
          throw new Error(`Field '${field}' was not cleared`);
        }
      }

      return res.body;
    } catch (err) {
      // Throw detailed error message
      throw new Error(
        err.response?.body?.errors?.map((e) => e.message).join("; ") ||
        "Failed to update recipient fields"
      );
    }
  }

  // ------------------------------
  // Send Emails
  // ------------------------------

  /**
   * Sends an email using a predefined dynamic template.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @param {Object} options - Email sending options.
   * @param {string} options.to - Recipient email address.
   * @param {string} options.from - Sender email address.
   * @param {string} options.templateKey - Key to identify the email template.
   * @param {Object} options.dynamicTemplateData - Dynamic data for the email template.
   * @param {string[]} [options.cc] - Optional array of CC email addresses.
   * @param {string[]} [options.bcc] - Optional array of BCC email addresses.
   * @returns {Promise<Object>} The SendGrid email response.
   * @throws {Error} If validation fails or email sending fails.
   */
  static async sendSimpleEmail({
    to,
    from,
    templateKey,
    dynamicTemplateData,
    cc,
    bcc,
  }) {
    // Validate recipient email
    if (!this._isValidEmail(to))
      throw new Error(`Invalid recipient email: ${to}`);

    // Validate sender email
    if (!this._isValidEmail(from))
      throw new Error(`Invalid sender email: ${from}`);

    // Validate CC email list if provided
    if (
      cc &&
      (!Array.isArray(cc) || cc.some((email) => !this._isValidEmail(email)))
    ) {
      throw new Error("Invalid CC email list");
    }

    // Validate BCC email list if provided
    if (
      bcc &&
      (!Array.isArray(bcc) || bcc.some((email) => !this._isValidEmail(email)))
    ) {
      throw new Error("Invalid BCC email list");
    }

    // Retrieve template configuration by key
    const template = this.loadEmailTemplateConfig()[templateKey];
    if (!template) throw new Error(`Unknown templateKey: ${templateKey}`);

    const { requiredFields, customFieldTypes } = template;

    // Check for missing required template fields
    const missingFields = requiredFields.filter(
      (field) => !(field in dynamicTemplateData)
    );
    if (missingFields.length) {
      throw new Error(
        `Missing required template fields: ${missingFields.join(", ")}`
      );
    }

    // Validate custom field types in dynamic data
    for (const [field, value] of Object.entries(dynamicTemplateData)) {
      const expected = customFieldTypes[field];
      if (!expected) continue;
      if (value === null) continue;

      if (expected === "string" && typeof value !== "string") {
        throw new Error(`Invalid type for ${field}: expected string`);
      }
      if (expected === "boolean" && typeof value !== "boolean") {
        throw new Error(`Invalid type for ${field}: expected boolean`);
      }
      if (expected === "array" && !Array.isArray(value)) {
        throw new Error(`Invalid type for ${field}: expected array`);
      }
    }

    // Construct email message payload
    const msg = {
      to,
      from,
      templateId: template.templateId,
      dynamicTemplateData,
      cc,
      bcc,
    };

    try {
      // Send email using SendGrid
      const response = await sgMail.send(msg);
      return response;
    } catch (err) {
      // Throw error if email sending fails
      throw new Error(`Failed to send email: ${err.message}`);
    }
  }

  /**
   * Creates and sends a marketing campaign email to a specific segment.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @param {Object} options - Campaign sending options.
   * @param {string} options.listId - ID of the marketing list.
   * @param {string} options.tag - Custom field tag used to filter the segment.
   * @param {string} options.templateKey - Key for the email template.
   * @param {Object} options.dynamicData - Dynamic data including senderId.
   * @param {string|number} [options.sendAt] - Optional time to send the campaign, or 'now'.
   * @returns {Promise<Object>} An object containing `campaignId` and `segmentId`.
   * @throws {Error} If the tag is invalid, segment creation fails, or campaign setup/scheduling fails.
   */
  static async sendCampaignEmail({
    listId,
    tag,
    templateKey,
    dynamicData,
    sendAt,
  }) {
    // Generate segment name using listId, tag, and senderId
    const segmentName = `segment_${listId}_${tag}__sender_${dynamicData.senderId}`;

    // Retrieve mapping of custom field types
    const customFieldMapping = this.buildFieldTypeFromEmailTemplateConfig();

    // Validate the tag against field mapping
    const tagType = customFieldMapping[tag];
    if (!tagType) throw new Error(`Invalid tag: ${tag}`);

    let segmentId;
    try {
      // Create a segment with the specified list and tag condition
      const [segmentRes] = await sgClient.request({
        method: "POST",
        url: "/v3/marketing/segments",
        body: {
          name: segmentName,
          list_ids: [listId],
          conditions: [
            { field: `custom_fields.${tag}`, operator: "equals", value: true },
          ],
        },
      });
      segmentId = segmentRes.body.id;
    } catch (err) {
      // Throw detailed error if segment creation fails
      throw new Error(
        `Failed to create segment: ${err.response?.body?.errors?.map((e) => e.message).join("; ") ||
        err.message
        }`
      );
    }

    // Create a campaign using the provided template and segment
    const [campaignRes] = await sgClient.request({
      method: "POST",
      url: "/v3/marketing/singlesends",
      body: {
        name: `Campaign_${templateKey}_${Date.now()}`,
        send_to: { segment_ids: [segmentId] },
        email_config: {
          sender_id: parseInt(process.env.SENDGRID_SENDER_ID),
          template_id: this.loadEmailTemplateConfig()[templateKey].templateId,
        },
      },
    });

    // Extract campaign ID from the response
    const campaignId = campaignRes.body.id;

    // Schedule the campaign to send immediately or at specified time
    await sgClient.request({
      method: "POST",
      url: `/v3/marketing/singlesends/${campaignId}/schedule`,
      body: { send_at: sendAt || "now" },
    });

    // Return campaign and segment IDs
    return { campaignId, segmentId };
  }

  // ------------------------------
  // Filtering & Querying Recipients
  // ------------------------------

  /**
   * Filters recipients in a list by a custom field tag value of `true`.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @param {Object} options - Filter options.
   * @param {string} options.listId - The ID of the list to search.
   * @param {string} options.tag - The custom field tag to filter by.
   * @returns {Promise<Object[]>} Array of recipients matching the tag condition.
   * @throws {Error} If the request to fetch contacts fails.
   */
  static async filterRecipientsByTag({ listId, tag }) {
    // Request recipients from the specified list
    const [res] = await sgClient.request({
      method: "GET",
      url: `/v3/marketing/contacts?list_ids=${listId}`,
    });

    // Return recipients where the custom field tag is true
    return res.body.result.filter(
      (recipient) => recipient.custom_fields?.[tag] === true
    );
  }

  /**
   * Fetches all sender lists from SendGrid with optional cache bypass.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @param {boolean} [force=false] - Whether to bypass cache and force a fresh fetch.
   * @returns {Promise<Object[]>} Array of sender list objects.
   * @throws {Error} If the request to fetch lists fails.
   */
  static async fetchAllSenderLists(force = false) {
    // Return cached list if available and force is not set
    if (this.listCache && !force) return this.listCache;

    // Fetch sender lists with retry logic
    const [res] = await this._withRetry(() =>
      sgClient.request({ method: "GET", url: "/v3/marketing/lists" })
    );

    // Cache and return the list data
    this.listCache = res.body.result;
    return this.listCache;
  }

  /**
   * Retrieves a sender's list and filters recipients by a custom field tag.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @param {string} senderId - ID of the sender.
   * @param {string} tag - Custom field tag to filter recipients by.
   * @returns {Promise<Object>} An object containing the list and matching recipients.
   * @throws {Error} If the request to fetch contacts fails.
   */
  static async getSenderListAndRecipientsByTag(senderId, tag) {
    // Format the sender's list name
    const listName = this._formatListNameForSender(senderId);

    // Fetch all sender lists
    const lists = await this.fetchAllSenderLists();

    // Find the target list by name
    const targetList = lists.find((list) => list.name === listName);
    if (!targetList) return { list: null, recipients: [] };

    // Fetch recipients in the target list
    const [res] = await sgClient.request({
      method: "GET",
      url: `/v3/marketing/contacts?list_ids=${targetList.id}`,
    });

    // Filter recipients with the tag set to true
    const matchingRecipients = res.body.result.filter(
      (recipient) => recipient.custom_fields?.[tag] === true
    );

    // Return both list info and matching recipients
    return { list: targetList, recipients: matchingRecipients };
  }

  /**
   * Fetches all recipients from a specific sender list with retry logic.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @param {string} listId - ID of the sender list to retrieve recipients from.
   * @returns {Promise<Object>} Full SendGrid API response for recipients.
   * @throws {Error} If the request fails after retries.
   */
  static async getRecipientsInSenderList(listId) {
    // Request recipients with retry
    const [res] = await this._withRetry(() =>
      sgClient.request({
        method: "GET",
        url: `/v3/marketing/contacts?list_ids=${listId}`,
      })
    );

    // Return full API response
    return res;
  }

  // ------------------------------
  // Utilities
  // ------------------------------

  /**
   * Ensures a sender list exists and verifies its availability in SendGrid.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @param {string} senderId - The ID of the sender.
   * @returns {Promise<Object>} The verified sender list object.
   * @throws {Error} If the list is not verified within retry attempts.
   */
  static async ensureSenderListExists(senderId) {
    // Generate the sender list name
    const listName = this._formatListNameForSender(senderId);

    // Retrieve or create the list by name
    const list = await this.ensureListExistsByName(listName);

    // Poll for list verification with retries
    const poll = async () => {
      const lists = await this.fetchAllSenderLists(true);
      const verified = lists.find((l) => l.name === listName);
      if (!verified) throw new Error("List not yet verified");
      return verified;
    };

    try {
      // Retry list verification using exponential backoff
      return await this._withRetry(poll, 5, 500, 1000);
    } catch {
      // Throw error if list verification fails
      throw new Error(`List creation failed: ${listName}`);
    }
  }

  /**
   * Ensures a sender list with the specified name exists, creating it if necessary.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @param {string} listName - The name of the sender list to ensure.
   * @returns {Promise<Object>} The existing or newly created sender list.
   * @throws {Error} If the list cannot be created or found after retry.
   */
  static async ensureListExistsByName(listName) {
    // Fetch all sender lists with fresh data
    const lists = await this.fetchAllSenderLists(true);

    // Find list by name
    let list = lists.find((l) => l.name === listName);

    // Create the list if not found
    if (!list) {
      await this._withRetry(() =>
        sgClient.request({
          method: "POST",
          url: "/v3/marketing/lists",
          body: { name: listName },
        })
      );

      // Wait before refreshing lists
      await new Promise((r) => setTimeout(r, 1000));

      // Re-fetch lists to confirm creation
      const newLists = await this.fetchAllSenderLists(true);
      list = newLists.find((l) => l.name === listName);

      // Throw error if list is still not found
      if (!list) {
        throw new Error(`List creation failed after retry: ${listName}`);
      }
    }

    return list;
  }

  /**
   * Ensures a custom field exists in SendGrid, creating it if missing.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @param {string} name - The name of the custom field to ensure.
   * @param {string} [type="text"] - The type of the custom field (text, number, date, etc.).
   * @returns {Promise<Object>} The existing or newly created custom field object.
   * @throws {Error} If creation fails for a reason other than an existing conflict.
   */
  static async ensureCustomFieldExists(name, type = "text") {
    // Retrieve existing custom fields
    const [existing] = await sgClient.request({
      method: "GET",
      url: "/v3/marketing/field_definitions",
    });

    // Check if the custom field already exists
    const exists = existing.body.custom_fields.find((f) => f.name === name);
    if (exists) return exists;

    try {
      // Create the custom field if it doesn't exist
      const [createRes] = await sgClient.request({
        method: "POST",
        url: "/v3/marketing/field_definitions",
        body: { name, field_type: type },
      });
      return createRes.body;
    } catch (err) {
      // Return existing field if error is due to conflict
      if (
        err.response?.body?.errors?.[0]?.message?.includes("already exists")
      ) {
        return existing.body.custom_fields.find((f) => f.name === name);
      }
      // Log and rethrow error for other failures
      console.error(`Failed to create custom field '${name}':`, err);
      throw err;
    }
  }

  /**
   * Resets all internal caches for templates, fields, and lists.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @returns {void}
   */
  static resetInternalCache() {
    // Clear the template cache
    this.templateCache = null;

    // Clear the field map cache
    this.fieldMapCache = null;

    // Clear the sender list cache
    this.listCache = null;
  }

  /**
   * Formats the list name string for a given sender ID.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @param {string} senderId - The ID of the sender.
   * @returns {string} The formatted list name.
   */
  static _formatListNameForSender(senderId) {
    // Return formatted sender list name
    return `sender_${senderId}_list`;
  }

  /**
   * Retries a given asynchronous function with exponential backoff on rate limit errors.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @param {Function} fn - The asynchronous function to retry.
   * @param {number} [retries=3] - Maximum number of retry attempts.
   * @param {number} [delay=500] - Initial delay in milliseconds between attempts.
   * @param {number} [maxDelay=3000] - Maximum delay in milliseconds between retries.
   * @returns {Promise<any>} The result of the successful function call.
   * @throws {Error} If the function fails after all retry attempts.
   */
  static async _withRetry(fn, retries = 3, delay = 500, maxDelay = 3000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Attempt to execute the function
        return await fn();
      } catch (err) {
        // Check for rate limiting error
        const isRateLimit = err.response?.statusCode === 429;

        // Rethrow if not a rate limit error or final attempt
        if (!isRateLimit || attempt === retries) throw err;

        // Calculate exponential backoff delay
        const waitTime = Math.min(delay * attempt, maxDelay);

        // Wait before next attempt
        await new Promise((res) => setTimeout(res, waitTime));
      }
    }
  }

  // ------------------------------
  // Block User
  // ------------------------------

  /**
   * Placeholder to block a recipient from a sender's lists and optionally suppress permanently.
   *
   * @since 1.0
   * @version 1.0
   * @author Linden May
   * @param {string} email - Recipient email address.
   * @param {string} senderId - Sender unique ID.
   * @returns {Promise<void>} Placeholder function, currently logs a warning.
   */
  static async blockRecipient(email, senderId) {
    // ⛔ Placeholder implementation:
    // Steps to implement:
    // 1. Lookup recipient by email
    // 2. Remove recipient from sender_{id}_list
    // 3. Optionally add recipient to suppression group for permanent block

    console.warn(
      `blockRecipient(${email}, sender ${senderId}) not yet implemented.`
    );
    // TODO: Integrate with suppression group and moderation system
  }
}

module.exports = TwilioSendGrid;

/*
future updates for Linden only
Security

Sanitize or encode dynamicTemplateData fields before usage if user-generated input is passed through to templates (defense-in-depth).


*/
