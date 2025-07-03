// emailTemplatesMap.js

const EmailTemplateMap = {
  'new-order-email': {
    templateId: 'd-1234567890abcdef1234567890abcdef', // real SendGrid ID
    path: 'templates/new-order-email.html',
    supportsLooping: true,
    requiredFields: ['order_id', 'user_name', 'items'],
    description: 'Template for new order notifications with item loop',
    customFieldTypes: {
      order_id: 'string',
      user_name: 'string',
      items: 'array' // each item should be an object with item_name, price, etc.
    }
  },
  'password-reset': {
    templateId: 'd-abcdef1234567890abcdef1234567890',
    path: 'templates/password-reset.html',
    supportsLooping: false,
    requiredFields: ['reset_link', 'user_email'],
    description: 'Password reset email with single link',
    customFieldTypes: {
      reset_link: 'url',
      user_email: 'email'
    }
  },
  'creator-broadcast': {
    templateId: 'd-broadcast00001234567890abc',
    path: 'templates/creator-broadcast.html',
    supportsLooping: false,
    requiredFields: ['creator_name', 'message_body'],
    description: 'Creator-wide message sent to subscribed fans',
    customFieldTypes: {
      creator_name: 'string',
      message_body: 'html'
    }
  }
};

module.exports = { EmailTemplateMap };
