require('dotenv').config();
const { expect } = require('chai');
const TwilioSendGrid = require('../services/TwilioSendGrid');

describe('TwilioSendGrid Class', function () {

    const testEmail = 'test@example.com'; // Use a verified test recipient
    const senderId = '123'; // Your test senderId
    const listName = `sender_${senderId}_list`;

    describe('Basic Methods', function () {

        it('should load email template config', function () {
            const config = TwilioSendGrid.loadEmailTemplateConfig();
            expect(config).to.be.an('object');
            expect(config).to.have.property('new-order-email');
        });

        it('should build field type map from templates', function () {
            const map = TwilioSendGrid.buildFieldTypeFromEmailTemplateConfig();
            expect(map).to.be.an('object');
            expect(map).to.have.property('order_id');
        });
    });

    describe('List Management', function () {

        it('should ensure sender list exists', async function () {
            const list = await TwilioSendGrid.ensureSenderListExists(senderId);
            expect(list).to.be.an('object');
            expect(list.name).to.equal(listName);
        });

        it('should create or fetch a custom field', async function () {
            const field = await TwilioSendGrid.ensureCustomFieldExists('test_field', 'text');
            expect(field).to.be.an('object');
            expect(field.name).to.equal('test_field');
        });
    });

    describe('Recipient Management', function () {

        it('should subscribe recipient to list with custom fields', async function () {
            const list = await TwilioSendGrid.ensureSenderListExists(senderId);
            const result = await TwilioSendGrid.subscribeOrUnsubscribeRecipientFromSenderListByTag(
                testEmail,
                list.id,
                { weekly_newsletter: true },
                true
            );
            expect(result).to.be.an('object');
        });

        it('should unsubscribe recipient and clear custom fields', async function () {
            const list = await TwilioSendGrid.ensureSenderListExists(senderId);
            const result = await TwilioSendGrid.subscribeOrUnsubscribeRecipientFromSenderListByTag(
                testEmail,
                list.id,
                { weekly_newsletter: true },
                false
            );
            expect(result).to.be.an('object');
        });
    });

    describe('Email Sending', function () {

        it('should send a simple email using template', async function () {
            const response = await TwilioSendGrid.sendSimpleEmail({
                to: testEmail,
                from: 'your_verified_sendgrid_email@example.com',
                templateKey: 'new-order-email',
                dynamicTemplateData: {
                    order_id: '123ABC',
                    user_name: 'Test User',
                    items: [{ item_name: 'T-Shirt', price: '$19.99' }]
                }
            });

            expect(response).to.be.an('array');
            expect(response[0].statusCode).to.equal(202); // Accepted
        });

    });

});

describe('Campaign and Segment Logic', function () {

    it('should create segment and campaign, then schedule it', async function () {
        const list = await TwilioSendGrid.ensureSenderListExists(senderId);

        const result = await TwilioSendGrid.sendCampaignEmail({
            listId: list.id,
            tag: 'weekly_newsletter',
            templateKey: 'creator-broadcast',
            dynamicData: { senderId },
            sendAt: 'now' // or set a future timestamp if needed
        });

        expect(result).to.be.an('object');
        expect(result).to.have.property('campaignId');
        expect(result).to.have.property('segmentId');
    });

});