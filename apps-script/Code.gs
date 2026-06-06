// WhatsApp Support Bot - Google Apps Script Backend
// Handles: warranty checks + ticket submission + email confirmation

const SPREADSHEET_ID = '1DCpy1NZDY749asAVaFeyfiGxH_8GLukrJYQLTW1tD9Q';
const PRODUCTS_SHEET = 'products';
const TICKETS_SHEET = 'tickets';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    let result;

    if (action === 'checkWarranty') {
      result = checkWarranty(data.serialNumber);
    } else if (action === 'submitTicket') {
      result = submitTicket(data);
    } else {
      result = { success: false, error: 'Unknown action' };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ------------------------------------------------------------------
// ACTION 1: Check warranty by serial number
// ------------------------------------------------------------------
function checkWarranty(serialNumber) {
  if (!serialNumber) return { success: false, error: 'No serial number provided' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(PRODUCTS_SHEET);
  const data = sheet.getDataRange().getValues();

  // Row 0 is headers: serial_number, product_name, purchase_date, warranty_months
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowSerial = String(row[0]).trim().toUpperCase();
    const inputSerial = String(serialNumber).trim().toUpperCase();

    if (rowSerial === inputSerial) {
      const productName    = row[1];
      const purchaseDate   = new Date(row[2]);
      const warrantyMonths = parseInt(row[3]);

      const expiryDate = new Date(purchaseDate);
      expiryDate.setMonth(expiryDate.getMonth() + warrantyMonths);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const daysRemaining = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      const isActive = daysRemaining > 0;

      return {
        success: true,
        found: true,
        serialNumber: row[0],
        productName: productName,
        purchaseDate: formatDate(purchaseDate),
        expiryDate: formatDate(expiryDate),
        warrantyMonths: warrantyMonths,
        daysRemaining: daysRemaining,
        isActive: isActive
      };
    }
  }

  return { success: true, found: false };
}

// ------------------------------------------------------------------
// ACTION 2: Submit a support ticket
// ------------------------------------------------------------------
function submitTicket(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(TICKETS_SHEET);

  const ticketId = generateTicketId(sheet);
  const timestamp = new Date();

  sheet.appendRow([
    ticketId,
    formatDateTime(timestamp),
    data.customerName,
    data.customerEmail,
    data.customerPhone,
    data.serialNumber,
    data.productName,
    data.issueDescription,
    data.ticketType,
    'Open'
  ]);

  sendTicketEmail(data, ticketId, timestamp);

  return {
    success: true,
    ticketId: ticketId
  };
}

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------
function generateTicketId(sheet) {
  const lastRow = sheet.getLastRow();
  const number = lastRow < 1 ? 1 : lastRow; // header is row 1, so first ticket = row 2 = number 1
  return 'TKT-' + String(number).padStart(4, '0');
}

function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateTime(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function sendTicketEmail(data, ticketId, timestamp) {
  const subject = `[${ticketId}] Support Ticket Received - ${data.productName}`;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #E60012; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Lenovo Support</h1>
      </div>
      <div style="padding: 30px; background-color: #f9f9f9;">
        <h2 style="color: #333;">Support Ticket Submitted</h2>
        <p>Hi <strong>${data.customerName}</strong>,</p>
        <p>Your support request has been received. Here are your ticket details:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #eee;">
            <td style="padding: 10px; font-weight: bold; width: 40%;">Ticket ID</td>
            <td style="padding: 10px;">${ticketId}</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold;">Date Submitted</td>
            <td style="padding: 10px;">${formatDate(timestamp)}</td>
          </tr>
          <tr style="background-color: #eee;">
            <td style="padding: 10px; font-weight: bold;">Product</td>
            <td style="padding: 10px;">${data.productName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold;">Serial Number</td>
            <td style="padding: 10px;">${data.serialNumber}</td>
          </tr>
          <tr style="background-color: #eee;">
            <td style="padding: 10px; font-weight: bold;">Issue</td>
            <td style="padding: 10px;">${data.issueDescription}</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold;">Service Type</td>
            <td style="padding: 10px;">${data.ticketType}</td>
          </tr>
          <tr style="background-color: #eee;">
            <td style="padding: 10px; font-weight: bold;">Status</td>
            <td style="padding: 10px; color: green;"><strong>Open</strong></td>
          </tr>
        </table>
        <p>Our support team will contact you within <strong>24-48 hours</strong>.</p>
        <p style="color: #888; font-size: 12px; margin-top: 30px;">
          This is an automated email from the Lenovo Support Bot.<br>
          Please do not reply to this email.
        </p>
      </div>
    </div>
  `;

  MailApp.sendEmail({
    to: data.customerEmail,
    subject: subject,
    htmlBody: htmlBody
  });
}
