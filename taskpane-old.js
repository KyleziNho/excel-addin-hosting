/* global Office, Excel */

// Cell Reference Tracker for dynamic formula generation
class CellReferenceTracker {
  constructor() {
    this.references = {
      assumptions: {},
      pnl: {},
      fcf: {}
    };
  }

  // Track where each assumption is placed
  trackAssumptionCell(itemName, cellAddress, worksheet = 'Assumptions') {
    if (!this.references[worksheet.toLowerCase()]) {
      this.references[worksheet.toLowerCase()] = {};
    }
    this.references[worksheet.toLowerCase()][itemName] = {
      cell: cellAddress,
      worksheet: worksheet
    };
  }

  // Get reference for formulas
  getReference(itemName, currentWorksheet = null) {
    // Check all worksheets for the reference
    for (const [ws, items] of Object.entries(this.references)) {
      if (items[itemName]) {
        const ref = items[itemName];
        // If we're on a different worksheet, include the worksheet name
        if (currentWorksheet && currentWorksheet.toLowerCase() !== ws) {
          return `${ref.worksheet}!${ref.cell}`;
        }
        return ref.cell;
      }
    }
    return null;
  }
}

class MAModelingAddin {
  constructor() {
    this.chatMessages = [];
    this.selectedRange = null;
    this.uploadedFiles = [];
    this.isInitialized = false;
    this.cellTracker = null;

    // Initialize when Office is ready
    console.log('MAModelingAddin constructor called');
    
    // Check if Office is already available
    if (typeof Office !== 'undefined' && Office.onReady) {
      Office.onReady((info) => {
        console.log('Office.onReady fired:', info);
        this.initializeAddin();
      });
    } else {
      console.log('Office not available, trying fallback initialization');
      // Fallback - try to initialize after a delay
      setTimeout(() => {
        this.initializeAddin();
      }, 2000);
    }
  }

  initializeAddin() {
    if (this.isInitialized) {
      console.log('Add-in already initialized, skipping');
      return;
    }
    
    console.log('Initializing add-in...');
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      console.log('DOM still loading, waiting...');
      document.addEventListener('DOMContentLoaded', () => {
        this.initializeAddin();
      });
      return;
    }
    
    // Set up event listeners
    const generateModelBtn = document.getElementById('generateModelBtn');
    const validateModelBtn = document.getElementById('validateModelBtn');
    const sendChatBtn = document.getElementById('sendChatBtn');
    const chatInput = document.getElementById('chatInput');
    const saveDataBtn = document.getElementById('saveDataBtn');
    const loadDataBtn = document.getElementById('loadDataBtn');
    
    console.log('DOM elements found:', {
      generateModelBtn: !!generateModelBtn,
      validateModelBtn: !!validateModelBtn,
      sendChatBtn: !!sendChatBtn,
      chatInput: !!chatInput,
      saveDataBtn: !!saveDataBtn,
      loadDataBtn: !!loadDataBtn
    });
    if (generateModelBtn) {
      generateModelBtn.addEventListener('click', () => this.generateModel());
      console.log('Generate model button listener added');
    }
    if (validateModelBtn) {
      validateModelBtn.addEventListener('click', () => this.validateModel());
      console.log('Validate model button listener added');
    }
    if (sendChatBtn) {
      sendChatBtn.addEventListener('click', () => this.sendChatMessage());
      console.log('Send chat button listener added');
    }
    if (saveDataBtn) {
      saveDataBtn.addEventListener('click', () => this.saveData());
      console.log('Save data button listener added');
    }
    if (loadDataBtn) {
      loadDataBtn.addEventListener('click', () => this.loadData());
      console.log('Load data button listener added');
    }
    
    // Allow Enter key in chat input
    if (chatInput) {
      chatInput.addEventListener('keypress', (e) => {
        console.log('Key pressed in chat input:', e.key);
        if (e.key === 'Enter') {
          e.preventDefault();
          console.log('Enter pressed, sending message');
          this.sendChatMessage();
        }
      });
      
      // Also add keydown for better compatibility
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          console.log('Enter keydown, sending message');
          this.sendChatMessage();
        }
      });
      console.log('Chat input listeners added');
    }

    // File upload event listeners
    this.initializeFileUpload();

    // Collapsible sections
    this.initializeCollapsibleSections();
    
    // Section completion monitoring
    this.initializeSectionMonitoring();
    
    // Auto-load saved data
    this.autoLoadSavedData();

    // Debt model functionality
    this.initializeDebtModel();

    // High-Level Parameters functionality
    this.initializeHighLevelParameters();

    // Deal Assumptions calculations
    this.initializeDealAssumptions();

    // Revenue Items functionality
    this.initializeRevenueItems();

    // Cost Items functionality
    this.initializeCostItems();

    // Exit Assumptions functionality
    this.initializeExitAssumptions();

    this.isInitialized = true;
    console.log('MAModelingAddin initialized successfully');
    
    // Add-in loaded successfully
    console.log('✅ Add-in loaded successfully! File upload and auto-fill ready.');
    
    // Test if Office.js is working
    if (typeof Office !== 'undefined' && Office.context) {
      console.log('📊 Excel integration ready! You can use all features.');
    } else {
      console.log('⚠️ Excel integration limited - some features may not work.');
    }
  }

  initializeFileUpload() {
    console.log('Initializing main file upload system...');
    
    // Get new upload system elements
    const mainUploadZone = document.getElementById('mainUploadZone');
    const mainFileInput = document.getElementById('mainFileInput');
    const browseFilesBtn = document.getElementById('browseFilesBtn');
    const autoFillBtn = document.getElementById('autoFillBtn');
    const uploadedFilesDisplay = document.getElementById('uploadedFilesDisplay');
    const filesGrid = document.getElementById('filesGrid');

    console.log('Main upload elements found:', {
      mainUploadZone: !!mainUploadZone,
      mainFileInput: !!mainFileInput,
      browseFilesBtn: !!browseFilesBtn,
      autoFillBtn: !!autoFillBtn,
      uploadedFilesDisplay: !!uploadedFilesDisplay,
      filesGrid: !!filesGrid
    });

    // Initialize main uploaded files array
    this.mainUploadedFiles = [];

    // Check if we're in Excel Online
    const isExcelOnline = window.location.hostname.includes('officeapps.live.com') || 
                         window.location.hostname.includes('excel.officeapps.live.com') ||
                         window.location.hostname.includes('excel.cloud.microsoft');
    
    if (isExcelOnline) {
      console.log('⚠️ Running in Excel Online - using alternative file handling');
    }

    // Main upload zone click handler
    if (mainUploadZone) {
      mainUploadZone.addEventListener('click', (e) => {
        console.log('Main upload zone clicked');
        // Don't prevent default if clicking on the actual file input
        if (e.target !== mainFileInput) {
          e.preventDefault();
        }
        if (mainFileInput) {
          console.log('Triggering main file input click');
          try {
            // Try different methods to trigger file input
            if (mainFileInput.click) {
              mainFileInput.click();
            } else {
              // Fallback: dispatch a click event
              const evt = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              mainFileInput.dispatchEvent(evt);
            }
          } catch (error) {
            console.error('Error triggering file input:', error);
            // Show a message for Excel Online users
            this.showMainUploadMessage('Please use the Browse Files button or drag and drop files.', 'info');
          }
        }
      });
    }

    // Browse files button click handler
    if (browseFilesBtn) {
      browseFilesBtn.addEventListener('click', (e) => {
        console.log('Browse files button clicked');
        e.preventDefault();
        e.stopPropagation();
        if (mainFileInput) {
          console.log('Triggering file input from browse button');
          try {
            // Try different methods to trigger file input
            if (mainFileInput.click) {
              mainFileInput.click();
            } else {
              // Fallback: dispatch a click event
              const evt = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              mainFileInput.dispatchEvent(evt);
            }
          } catch (error) {
            console.error('Error triggering file input from button:', error);
            // Show a message for Excel Online users
            this.showMainUploadMessage('File upload may be restricted in Excel Online. Try drag and drop.', 'info');
          }
        }
      });
    }

    // Main file input change handler
    if (mainFileInput) {
      mainFileInput.addEventListener('change', (e) => {
        console.log('Main file input changed');
        const files = e.target.files;
        console.log('Files selected:', files ? files.length : 0);
        if (files && files.length > 0) {
          console.log('Processing main files:', Array.from(files).map(f => f.name));
          this.handleMainFileSelection(Array.from(files));
        }
        // Reset the input
        e.target.value = '';
      });
    }

    // Drag and drop handlers for main upload zone
    if (mainUploadZone) {
      mainUploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        mainUploadZone.classList.add('dragover');
      });

      mainUploadZone.addEventListener('dragleave', (e) => {
        // Only remove dragover if we're leaving the main container
        if (!mainUploadZone.contains(e.relatedTarget)) {
          mainUploadZone.classList.remove('dragover');
        }
      });

      mainUploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        mainUploadZone.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files || []);
        console.log('Files dropped:', files.length);
        this.handleMainFileSelection(files);
      });
    }

    // Auto Fill button handler
    if (autoFillBtn) {
      autoFillBtn.addEventListener('click', () => {
        this.processAutoFill();
      });
      // Initially disabled until files are uploaded
      autoFillBtn.disabled = true;
    }

    console.log('✅ Main file upload system initialized');
  }

  handleFileSelection(files) {
    console.log('Handling file selection:', files.length, 'files');
    
    // Filter valid files (PDF and CSV only)
    const validFiles = files.filter(file => {
      const isValidType = file.type === 'application/pdf' || file.type === 'text/csv' || file.name.endsWith('.csv');
      const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB limit
      console.log(`File ${file.name}: type=${file.type}, size=${file.size}, valid=${isValidType && isValidSize}`);
      return isValidType && isValidSize;
    });

    console.log('Valid files:', validFiles.length);

    // Check total file limit
    if (this.uploadedFiles.length + validFiles.length > 4) {
      console.log('Too many files uploaded');
      this.addChatMessage('assistant', 'Maximum 4 files allowed. Please remove some files first.');
      return;
    }

    // Add files to uploaded list
    this.uploadedFiles.push(...validFiles);
    console.log('Total uploaded files:', this.uploadedFiles.length);
    this.updateFileDisplay();

    if (validFiles.length > 0) {
      console.log('Files uploaded successfully');
      this.addChatMessage('assistant', `Successfully uploaded ${validFiles.length} file(s). You can now ask me to analyze them and fill out your assumptions template!`);
    } else {
      console.log('No valid files to upload');
      this.addChatMessage('assistant', 'Please upload PDF or CSV files only (max 10MB each).');
    }
  }

  updateFileDisplay() {
    const uploadedFilesDiv = document.getElementById('uploadedFiles');
    const fileList = document.getElementById('fileList');

    if (this.uploadedFiles.length === 0) {
      if (uploadedFilesDiv) uploadedFilesDiv.style.display = 'none';
      return;
    }

    if (uploadedFilesDiv) uploadedFilesDiv.style.display = 'block';
    if (fileList) fileList.innerHTML = '';

    this.uploadedFiles.forEach((file, index) => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      fileItem.innerHTML = `
        <div class="file-info">
          <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14,2 14,8 20,8"></polyline>
          </svg>
          <div>
            <div class="file-name">${file.name}</div>
            <div class="file-size">${this.formatFileSize(file.size)}</div>
          </div>
        </div>
        <button class="remove-file" data-index="${index}">Remove</button>
      `;

      const removeBtn = fileItem.querySelector('.remove-file');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => this.removeFile(index));
      }

      if (fileList) fileList.appendChild(fileItem);
    });
  }

  removeFile(index) {
    this.uploadedFiles.splice(index, 1);
    this.updateFileDisplay();
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  handleMainFileSelection(files) {
    console.log('Handling main file selection:', files.length, 'files');
    
    // Filter valid files (PDF and CSV only)
    const validFiles = files.filter(file => {
      const isValidType = file.type === 'application/pdf' || file.type === 'text/csv' || file.name.endsWith('.csv');
      const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB per file
      console.log(`File ${file.name}: type=${file.type}, size=${file.size}, valid=${isValidType && isValidSize}`);
      return isValidType && isValidSize;
    });

    console.log('Valid files for main upload:', validFiles.length);

    // Check file limits
    if (this.mainUploadedFiles.length + validFiles.length > 4) {
      this.showMainUploadMessage('Maximum 4 files allowed. Please remove some files first.', 'error');
      return;
    }

    // Check total size limit (10MB total)
    const currentTotalSize = this.mainUploadedFiles.reduce((total, file) => total + file.size, 0);
    const newFilesSize = validFiles.reduce((total, file) => total + file.size, 0);
    const totalSize = currentTotalSize + newFilesSize;

    if (totalSize > 10 * 1024 * 1024) {
      this.showMainUploadMessage('Total file size cannot exceed 10MB. Please select smaller files.', 'error');
      return;
    }

    // Add files to main uploaded list
    this.mainUploadedFiles.push(...validFiles);
    console.log('Total main uploaded files:', this.mainUploadedFiles.length);
    
    this.updateMainFileDisplay();

    if (validFiles.length > 0) {
      console.log('Main files uploaded successfully');
      this.showMainUploadMessage(`Successfully uploaded ${validFiles.length} file(s). Click "Auto Fill with AI" to extract data.`, 'success');
    } else {
      console.log('No valid files to upload');
      this.showMainUploadMessage('Please upload PDF or CSV files only (max 10MB total).', 'error');
    }
  }

  updateMainFileDisplay() {
    const uploadedFilesDisplay = document.getElementById('uploadedFilesDisplay');
    const filesGrid = document.getElementById('filesGrid');
    const autoFillBtn = document.getElementById('autoFillBtn');
    const mainUploadZone = document.getElementById('mainUploadZone');

    if (this.mainUploadedFiles.length === 0) {
      if (uploadedFilesDisplay) uploadedFilesDisplay.style.display = 'none';
      if (autoFillBtn) autoFillBtn.disabled = true;
      if (mainUploadZone) mainUploadZone.style.display = 'block';
      return;
    }

    // Show files display and hide upload zone
    if (uploadedFilesDisplay) uploadedFilesDisplay.style.display = 'block';
    if (autoFillBtn) autoFillBtn.disabled = false;
    if (mainUploadZone) mainUploadZone.style.display = 'none';

    // Clear and populate files grid
    if (filesGrid) {
      filesGrid.innerHTML = '';

      this.mainUploadedFiles.forEach((file, index) => {
        const fileCard = document.createElement('div');
        fileCard.className = 'file-card';
        
        const fileIcon = file.type === 'application/pdf' ? 
          `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline>` :
          `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline><path d="M16 13v3"></path><path d="M8 13v3"></path><path d="M12 13v3"></path>`;

        fileCard.innerHTML = `
          <svg class="file-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${fileIcon}
          </svg>
          <div class="file-card-info">
            <div class="file-card-name">${file.name}</div>
            <div class="file-card-size">${this.formatFileSize(file.size)}</div>
          </div>
          <button class="file-card-remove" data-index="${index}" title="Remove file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        `;

        const removeBtn = fileCard.querySelector('.file-card-remove');
        if (removeBtn) {
          removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeMainFile(index);
          });
        }

        filesGrid.appendChild(fileCard);
      });
    }
  }

  removeMainFile(index) {
    this.mainUploadedFiles.splice(index, 1);
    this.updateMainFileDisplay();
    console.log('Removed main file at index:', index);
  }

  showMainUploadMessage(message, type = 'info') {
    // This could be enhanced to show toast notifications
    console.log(`Main Upload ${type.toUpperCase()}:`, message);
    
    // For now, we'll use console logging, but this could be enhanced with UI notifications
    if (type === 'error') {
      console.error(message);
    } else if (type === 'success') {
      console.log('✅', message);
    } else {
      console.info('ℹ️', message);
    }
  }

  async selectAssumptionsRange() {
    console.log('Select assumptions range clicked');
    
    // Check if Excel is available
    if (typeof Excel === 'undefined') {
      console.error('Excel API not available');
      this.addChatMessage('assistant', '❌ Excel API not available. Please make sure you are running this in Excel.');
      return;
    }
    
    try {
      await Excel.run(async (context) => {
        const range = context.workbook.getSelectedRange();
        range.load(['address', 'values', 'text']);
        
        await context.sync();
        
        this.selectedRange = range.address;
        const rangeData = range.values;
        
        // Update UI
        const statusElement = document.getElementById('rangeStatus');
        if (statusElement) {
          statusElement.textContent = `Selected: ${range.address} (${rangeData.length} rows)`;
        }
        
        // Try to parse assumptions from selected range
        this.parseAssumptionsFromRange(rangeData);
        this.addChatMessage('assistant', `✅ Selected range ${range.address} with ${rangeData.length} rows.`);
      });
    } catch (error) {
      console.error('Error selecting range:', error);
      this.addChatMessage('assistant', `❌ Error selecting range: ${error.message || error}`);
    }
  }

  parseAssumptionsFromRange(rangeData) {
    // Smart parsing of assumptions from Excel range
    const assumptions = {};
    
    for (let i = 0; i < rangeData.length; i++) {
      const row = rangeData[i];
      if (row.length >= 2) {
        const label = String(row[0]).toLowerCase();
        const value = row[1];
        
        // Map common assumption labels to our fields
        if (label.includes('deal') && label.includes('size')) {
          assumptions.dealSize = parseFloat(value) || 0;
        } else if (label.includes('ltv') || label.includes('leverage')) {
          assumptions.ltv = parseFloat(value) * (value <= 1 ? 100 : 1); // Convert decimal to percentage
        } else if (label.includes('holding') || label.includes('period')) {
          assumptions.holdingPeriod = parseFloat(value) || 0;
        } else if (label.includes('revenue') && label.includes('growth')) {
          assumptions.revenueGrowth = parseFloat(value) * (value <= 1 ? 100 : 1);
        } else if (label.includes('exit') && label.includes('multiple')) {
          assumptions.exitMultiple = parseFloat(value) || 0;
        }
      }
    }
    
    // Update form fields with parsed values
    this.updateFormWithAssumptions(assumptions);
  }

  updateFormWithAssumptions(assumptions) {
    const fields = ['dealSize', 'ltv', 'holdingPeriod', 'revenueGrowth', 'exitMultiple'];
    
    fields.forEach(field => {
      const element = document.getElementById(field);
      if (element && assumptions[field] !== undefined) {
        element.value = assumptions[field].toString();
      }
    });
  }

  async generateModel() {
    console.log('Generate model clicked');
    
    // Auto-save data before generating
    try {
      console.log('Auto-saving data before generation...');
      const formData = this.collectAllFormData();
      localStorage.setItem('maModelingData', JSON.stringify(formData));
      console.log('Data auto-saved successfully');
    } catch (saveError) {
      console.warn('Auto-save failed:', saveError);
      // Continue with generation even if save fails
    }
    
    // First validate all required fields are filled
    const validation = this.validateAllFields();
    if (!validation.isValid) {
      this.addChatMessage('assistant', `⚠️ Please fill out all required fields before generating the model:\n${validation.errors.join('\n')}`);
      return;
    }

    try {
      await Excel.run(async (context) => {
        console.log('Starting Excel.run...');
        
        // Create a new worksheet named "Assumptions"
        const sheets = context.workbook.worksheets;
        let assumptionsSheet;
        
        console.log('Got worksheets collection');
        
        try {
          // Try to get existing sheet
          assumptionsSheet = sheets.getItem("Assumptions");
          assumptionsSheet.delete();
          await context.sync();
          console.log('Deleted existing Assumptions sheet');
        } catch (e) {
          console.log('No existing Assumptions sheet to delete');
        }
        
        // Create new sheet
        console.log('Creating new Assumptions sheet...');
        assumptionsSheet = sheets.add("Assumptions");
        await context.sync();
        console.log('Assumptions sheet created successfully');
        
        assumptionsSheet.activate();
        console.log('Assumptions sheet activated');
        
        // Collect all data
        console.log('Collecting model data...');
        const modelData = this.collectAllModelData();
        console.log('Model data collected:', modelData);
        
        // Generate the assumptions page layout
        console.log('Starting assumptions layout creation...');
        await this.createAssumptionsLayout(context, assumptionsSheet, modelData);
        console.log('Assumptions layout completed');
        
        await context.sync();
        console.log('Assumptions context synced');
        
        // Activate the Assumptions sheet to show it first
        assumptionsSheet.activate();
        
        this.addChatMessage('assistant', '✅ Assumptions page generated! Creating Profit & Loss statement...');
        
        // Now create P&L sheet in a separate Excel.run context
        setTimeout(async () => {
          await this.generatePLSheet(modelData);
        }, 1000); // Wait 1 second for assumptions to be fully ready
      });
    } catch (error) {
      console.error('Error generating model:', error);
      this.addChatMessage('assistant', `❌ Error generating model: ${error.message}`);
    }
  }

  async generatePLSheet(modelData) {
    try {
      await Excel.run(async (context) => {
        const sheets = context.workbook.worksheets;
        
        // Create cell reference tracker
        this.cellTracker = new CellReferenceTracker();
        
        let plSheet;
        try {
          // Try to get existing P&L sheet
          plSheet = sheets.getItem("ProfitLoss");
          plSheet.delete();
          await context.sync();
          console.log('Deleted existing P&L sheet');
        } catch (e) {
          console.log('No existing P&L sheet to delete');
        }
        
        // Create new P&L sheet
        console.log('Creating new P&L sheet...');
        plSheet = sheets.add("ProfitLoss");
        await context.sync();
        console.log('P&L sheet created successfully');
        
        // Generate the P&L statement layout
        console.log('Starting P&L layout generation...');
        await this.createProfitLossLayout(context, plSheet, modelData);
        console.log('P&L layout completed');
        
        await context.sync();
        console.log('P&L context synced');
        
        this.addChatMessage('assistant', '✅ Profit & Loss statement generated! Creating Cashflows statement...');
        
        // Now create FCF sheet in another separate context
        setTimeout(async () => {
          await this.generateFCFSheet(modelData);
        }, 1000); // Wait for P&L to be fully ready
      });
    } catch (error) {
      console.error('Error generating P&L sheet:', error);
      this.addChatMessage('assistant', `❌ Error generating P&L sheet: ${error.message}`);
    }
  }

  async generateFCFSheet(modelData) {
    try {
      await Excel.run(async (context) => {
        const sheets = context.workbook.worksheets;
        
        let fcfSheet;
        try {
          // Try to get existing FCF sheet
          fcfSheet = sheets.getItem("Cashflows");
          fcfSheet.delete();
          await context.sync();
          console.log('Deleted existing FCF sheet');
        } catch (e) {
          console.log('No existing FCF sheet to delete');
        }
        
        // Create new FCF sheet
        console.log('Creating new FCF sheet...');
        fcfSheet = sheets.add("Cashflows");
        await context.sync();
        console.log('FCF sheet created successfully');
        
        // Generate the FCF statement layout
        console.log('Starting FCF layout generation...');
        await this.createCashflowsLayout(context, fcfSheet, modelData);
        console.log('FCF layout completed');
        
        await context.sync();
        console.log('FCF context synced');
        
        // Activate the Assumptions sheet to show the complete model
        const assumptionsSheet = sheets.getItem("Assumptions");
        assumptionsSheet.activate();
        
        this.addChatMessage('assistant', '✅ Complete financial model generated successfully! All three sheets (Assumptions, P&L, and Cashflows) are ready in Excel.');
      });
    } catch (error) {
      console.error('Error generating FCF sheet:', error);
      this.addChatMessage('assistant', `❌ Error generating FCF sheet: ${error.message}`);
    }
  }

  validateAllFields() {
    const errors = [];
    const requiredFields = [
      // High-Level Parameters
      { id: 'currency', name: 'Currency' },
      { id: 'projectStartDate', name: 'Project Start Date' },
      { id: 'projectEndDate', name: 'Project End Date' },
      { id: 'modelPeriods', name: 'Model Periods' },
      
      // Deal Assumptions
      { id: 'dealName', name: 'Deal Name' },
      { id: 'dealValue', name: 'Deal Value' },
      { id: 'transactionFee', name: 'Transaction Fee' },
      { id: 'dealLTV', name: 'Deal LTV' },
      
      // Exit Assumptions
      { id: 'disposalCost', name: 'Disposal Cost' },
      { id: 'terminalCapRate', name: 'Terminal Cap Rate' }
    ];
    
    // Check required fields
    requiredFields.forEach(field => {
      const element = document.getElementById(field.id);
      if (!element || !element.value || element.value.trim() === '') {
        errors.push(`• ${field.name}`);
      }
    });
    
    // Check at least one revenue item exists
    const revenueItems = document.querySelectorAll('.revenue-item');
    if (revenueItems.length === 0) {
      errors.push('• At least one Revenue Item');
    }
    
    // Check at least one cost item exists
    const costItems = document.querySelectorAll('.cost-item');
    if (costItems.length === 0) {
      errors.push('• At least one Cost Item');
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  collectAllModelData() {
    const data = {
      // Company info
      dealName: document.getElementById('dealName').value || 'Sample Company Ltd.',
      dealType: 'Office Acquisition',
      sector: 'Real Estate',
      geography: 'United States',
      businessModel: 'Core-Plus/Light Refurb',
      ownershipStructure: 'Private',
      
      // Acquisition Assumptions
      acquisitionDate: this.formatDateForExcel(document.getElementById('projectStartDate').value),
      projectStartDate: document.getElementById('projectStartDate').value,
      projectEndDate: document.getElementById('projectEndDate').value,
      modelPeriods: parseInt(document.getElementById('modelPeriods').value) || 12,
      holdingPeriod: this.calculateHoldingPeriod(),
      currency: document.getElementById('currency').value,
      transactionFee: parseFloat(document.getElementById('transactionFee').value) || 0,
      acquisitionLTV: parseFloat(document.getElementById('dealLTV').value) || 0,
      dealValue: parseFloat(document.getElementById('dealValue').value) || 0,
      
      // Revenue Items
      revenueItems: this.collectRevenueItems(),
      
      // Cost Items
      costItems: this.collectCostItems(),
      
      // Exit Assumptions
      disposalCost: parseFloat(document.getElementById('disposalCost').value) || 0,
      terminalCapRate: parseFloat(document.getElementById('terminalCapRate').value) || 0,
      
      // Debt info if enabled
      hasDebt: document.getElementById('debtYes')?.checked || false,
      debtAmount: 0,
      interestRateMargin: 0
    };
    
    // Calculate debt amount and collect debt info if enabled
    if (data.hasDebt) {
      data.debtAmount = data.dealValue * (data.acquisitionLTV / 100);
      data.equityContribution = data.dealValue - data.debtAmount;
      
      // Get debt parameters
      const debtInputs = document.querySelectorAll('#debtParameters input');
      debtInputs.forEach(input => {
        if (input.id === 'marginRate') {
          data.interestRateMargin = parseFloat(input.value) || 2.0;
        }
      });
    } else {
      data.equityContribution = data.dealValue;
      data.debtAmount = 0;
    }
    
    return data;
  }

  formatDateForExcel(dateString) {
    if (!dateString) return '31/3/25';
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear().toString().substr(-2);
    return `${day}/${month}/${year}`;
  }

  calculateHoldingPeriod() {
    const startDate = document.getElementById('projectStartDate').value;
    const endDate = document.getElementById('projectEndDate').value;
    
    if (!startDate || !endDate) return 24;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    
    return Math.max(1, monthsDiff);
  }

  collectRevenueItems() {
    const items = [];
    const revenueContainers = document.querySelectorAll('.revenue-item');
    
    revenueContainers.forEach((container, index) => {
      const nameInput = container.querySelector(`#revenueName_${index + 1}`);
      const valueInput = container.querySelector(`#revenueValue_${index + 1}`);
      const growthTypeInput = container.querySelector(`#growthType_${index + 1}`);
      const growthInput = container.querySelector(`#linearGrowth_${index + 1}`);
      
      if (nameInput && valueInput) {
        items.push({
          name: nameInput.value || `Revenue Item ${index + 1}`,
          value: parseFloat(valueInput.value) || 0,
          growth: parseFloat(growthInput?.value) || 0,
          growthType: growthTypeInput?.value || 'linear'
        });
      }
    });
    
    return items;
  }

  collectCostItems() {
    const opexItems = this.collectOperatingExpenses();
    const capexItems = this.collectCapitalExpenses();
    
    // Add default items if empty
    if (opexItems.length === 0) {
      opexItems.push({ name: 'Staff expenses', value: 60000, growth: 0.5 });
    }
    
    return { opex: opexItems, capex: capexItems };
  }

  collectOperatingExpenses() {
    const items = [];
    const opExContainer = document.getElementById('operatingExpensesContainer');
    if (!opExContainer) return items;
    
    const costContainers = opExContainer.querySelectorAll('.cost-item');
    
    costContainers.forEach((container, index) => {
      const nameInput = container.querySelector(`#opExName_${index + 1}`);
      const valueInput = container.querySelector(`#opExValue_${index + 1}`);
      const growthTypeInput = container.querySelector(`#opExGrowthType_${index + 1}`);
      const growthInput = container.querySelector(`#linearGrowth_opEx_${index + 1}`);
      
      if (nameInput && valueInput) {
        const item = {
          name: nameInput.value || `Operating Expense ${index + 1}`,
          value: parseFloat(valueInput.value) || 0,
          growth: parseFloat(growthInput?.value) || 2.0,
          growthType: growthTypeInput?.value || 'linear'
        };
        items.push(item);
      }
    });
    
    return items;
  }

  collectCapitalExpenses() {
    const items = [];
    const capExContainer = document.getElementById('capitalExpensesContainer');
    if (!capExContainer) return items;
    
    const costContainers = capExContainer.querySelectorAll('.cost-item');
    
    costContainers.forEach((container, index) => {
      const nameInput = container.querySelector(`#capExName_${index + 1}`);
      const valueInput = container.querySelector(`#capExValue_${index + 1}`);
      const growthTypeInput = container.querySelector(`#capExGrowthType_${index + 1}`);
      const growthInput = container.querySelector(`#linearGrowth_capEx_${index + 1}`);
      
      if (nameInput && valueInput) {
        const item = {
          name: nameInput.value || `Capital Expense ${index + 1}`,
          value: parseFloat(valueInput.value) || 0,
          growth: parseFloat(growthInput?.value) || 2.0,
          growthType: growthTypeInput?.value || 'linear'
        };
        items.push(item);
      }
    });
    
    return items;
  }

  collectAssumptions() {
    const getValue = (id) => {
      const element = document.getElementById(id);
      return element ? element.value : '';
    };

    return {
      dealName: getValue('dealName') || 'Sample Deal',
      dealSize: parseFloat(getValue('dealSize')) || 50,
      ltv: parseFloat(getValue('ltv')) || 70,
      holdingPeriod: parseFloat(getValue('holdingPeriod')) || 60,
      revenueGrowth: parseFloat(getValue('revenueGrowth')) || 15,
      exitMultiple: parseFloat(getValue('exitMultiple')) || 12,
      selectedRange: this.selectedRange || undefined
    };
  }

  async createAssumptionsLayout(context, sheet, data) {
    // Add title at row 3
    sheet.getRange("C3").values = [["Company Logo (doing the M&A Process)"]];
    sheet.getRange("C3").format.font.bold = true;
    sheet.getRange("C3").format.font.name = "Times New Roman";
    sheet.getRange("C3").format.font.size = 12;
    sheet.getRange("C3").format.horizontalAlignment = "Center";
    
    // Company name and header - Row 5 (ends at column B)
    sheet.getRange("A5:B5").merge();
    sheet.getRange("A5").values = [[`${data.dealName} - Key Assumptions`]];
    sheet.getRange("A5").format.font.bold = true;
    sheet.getRange("A5").format.font.name = "Times New Roman";
    sheet.getRange("A5").format.font.size = 12;
    sheet.getRange("A5:B5").format.fill.color = "#E5E5E5";
    
    // Empty row before Company Info Section (Row 6)
    sheet.getRange("6:6").format.rowHeight = 5;
    
    // Company Info Section - Rows 7-11
    sheet.getRange("A7").values = [["Deal type"]];
    sheet.getRange("B7").values = [[data.dealType]];
    sheet.getRange("A7:B7").format.font.name = "Times New Roman";
    sheet.getRange("A7:B7").format.font.size = 12;
    sheet.getRange("B7").format.horizontalAlignment = "Right";
    
    sheet.getRange("A8").values = [["Sector/Industry"]];
    sheet.getRange("B8").values = [[data.sector]];
    sheet.getRange("A8:B8").format.font.name = "Times New Roman";
    sheet.getRange("A8:B8").format.font.size = 12;
    sheet.getRange("B8").format.horizontalAlignment = "Right";
    
    sheet.getRange("A9").values = [["Geography"]];
    sheet.getRange("B9").values = [[data.geography]];
    sheet.getRange("A9:B9").format.font.name = "Times New Roman";
    sheet.getRange("A9:B9").format.font.size = 12;
    sheet.getRange("B9").format.horizontalAlignment = "Right";
    
    sheet.getRange("A10").values = [["Business Model"]];
    sheet.getRange("B10").values = [[data.businessModel]];
    sheet.getRange("A10:B10").format.font.name = "Times New Roman";
    sheet.getRange("A10:B10").format.font.size = 12;
    sheet.getRange("B10").format.horizontalAlignment = "Right";
    
    sheet.getRange("A11").values = [["Ownership Structure"]];
    sheet.getRange("B11").values = [[data.ownershipStructure]];
    sheet.getRange("A11:B11").format.font.name = "Times New Roman";
    sheet.getRange("A11:B11").format.font.size = 12;
    sheet.getRange("B11").format.horizontalAlignment = "Right";
    
    // Empty row before Acquisition Assumptions (Row 12)
    sheet.getRange("12:12").format.rowHeight = 5;
    
    // Acquisition Assumptions Header - Row 13
    sheet.getRange("A13:B13").merge();
    sheet.getRange("A13").values = [["Acquisition Assumptions"]];
    sheet.getRange("A13").format.font.bold = true;
    sheet.getRange("A13").format.font.name = "Times New Roman";
    sheet.getRange("A13").format.font.size = 12;
    sheet.getRange("A13").format.font.color = "white";
    sheet.getRange("A13:B13").format.fill.color = "#1F3A5F";
    
    // Acquisition data - Rows 14-23 (added Purchase Price at top)
    sheet.getRange("A14").values = [["Purchase Price"]];
    sheet.getRange("B14").values = [[data.dealValue]];
    sheet.getRange("A14:B14").format.font.name = "Times New Roman";
    sheet.getRange("A14:B14").format.font.size = 12;
    sheet.getRange("B14").numberFormat = [["#,##0"]];
    sheet.getRange("B14").format.horizontalAlignment = "Right";
    
    sheet.getRange("A15").values = [["Acquisition date"]];
    sheet.getRange("B15").values = [[data.acquisitionDate]];
    sheet.getRange("A15:B15").format.font.name = "Times New Roman";
    sheet.getRange("A15:B15").format.font.size = 12;
    sheet.getRange("B15").format.horizontalAlignment = "Right";
    
    sheet.getRange("A16").values = [["Holding Period (Months)"]];
    sheet.getRange("B16").values = [[data.holdingPeriod]];
    sheet.getRange("A16:B16").format.font.name = "Times New Roman";
    sheet.getRange("A16:B16").format.font.size = 12;
    sheet.getRange("B16").format.horizontalAlignment = "Right";
    
    sheet.getRange("A17").values = [["Currency"]];
    sheet.getRange("B17").values = [[data.currency === 'USD' ? '$' : data.currency]];
    sheet.getRange("A17:B17").format.font.name = "Times New Roman";
    sheet.getRange("A17:B17").format.font.size = 12;
    sheet.getRange("B17").format.horizontalAlignment = "Right";
    
    sheet.getRange("A18").values = [["Transaction Fees"]];
    sheet.getRange("B18").values = [[data.transactionFee / 100]];
    sheet.getRange("A18:B18").format.font.name = "Times New Roman";
    sheet.getRange("A18:B18").format.font.size = 12;
    sheet.getRange("B18").numberFormat = [["0.00%"]];
    sheet.getRange("B18").format.horizontalAlignment = "Right";
    
    sheet.getRange("A19").values = [["Acquisition LTV"]];
    sheet.getRange("B19").values = [[data.acquisitionLTV / 100]];
    sheet.getRange("A19:B19").format.font.name = "Times New Roman";
    sheet.getRange("A19:B19").format.font.size = 12;
    sheet.getRange("B19").numberFormat = [["0.00%"]];
    sheet.getRange("B19").format.horizontalAlignment = "Right";
    
    // Equity Contribution - Formula: Purchase Price * (1 - LTV)
    sheet.getRange("A20").values = [["Equity Contribution"]];
    sheet.getRange("B20").formulas = [["=B14*(1-B19)"]];
    sheet.getRange("A20:B20").format.font.name = "Times New Roman";
    sheet.getRange("A20:B20").format.font.size = 12;
    sheet.getRange("B20").numberFormat = [["#,##0"]];
    sheet.getRange("B20").format.horizontalAlignment = "Right";
    
    // Debt Financing - Formula: Purchase Price * LTV
    sheet.getRange("A21").values = [["Debt Financing"]];
    sheet.getRange("B21").formulas = [["=B14*B19"]];
    sheet.getRange("A21:B21").format.font.name = "Times New Roman";
    sheet.getRange("A21:B21").format.font.size = 12;
    sheet.getRange("B21").numberFormat = [["#,##0"]];
    sheet.getRange("B21").format.horizontalAlignment = "Right";
    
    sheet.getRange("A22").values = [["Debt Issuance Fees"]];
    sheet.getRange("B22").values = [[0.01]];
    sheet.getRange("A22:B22").format.font.name = "Times New Roman";
    sheet.getRange("A22:B22").format.font.size = 12;
    sheet.getRange("B22").numberFormat = [["0.00%"]];
    sheet.getRange("B22").format.horizontalAlignment = "Right";
    
    sheet.getRange("A23").values = [["Interest Rate Margin"]];
    sheet.getRange("B23").values = [[data.interestRateMargin / 100]];
    sheet.getRange("A23:B23").format.font.name = "Times New Roman";
    sheet.getRange("A23:B23").format.font.size = 12;
    sheet.getRange("B23").numberFormat = [["0.00%"]];
    sheet.getRange("B23").format.horizontalAlignment = "Right";
    
    // Empty row before Revenue Items (Row 24)
    sheet.getRange("24:24").format.rowHeight = 5;
    
    // Revenue Items Header - Row 25
    sheet.getRange("A25:B25").merge();
    sheet.getRange("A25").values = [["Revenue Items"]];
    sheet.getRange("A25").format.font.bold = true;
    sheet.getRange("A25").format.font.name = "Times New Roman";
    sheet.getRange("A25").format.font.size = 12;
    sheet.getRange("A25").format.font.color = "white";
    sheet.getRange("A25:B25").format.fill.color = "#1F3A5F";
    
    // Revenue items starting at row 26
    let currentRow = 26;
    data.revenueItems.forEach((item, index) => {
      sheet.getRange(`A${currentRow}`).values = [[item.name]];
      sheet.getRange(`B${currentRow}`).values = [[item.value]];
      sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.name = "Times New Roman";
      sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.size = 12;
      sheet.getRange(`B${currentRow}`).numberFormat = [["#,##0"]];
      sheet.getRange(`B${currentRow}`).format.horizontalAlignment = "Right";
      currentRow++;
      
      if (item.growth > 0) {
        sheet.getRange(`A${currentRow}`).values = [[`Rent Growth ${index + 1}`]];
        sheet.getRange(`B${currentRow}`).values = [[item.growth / 100]];
        sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.name = "Times New Roman";
        sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.size = 12;
        sheet.getRange(`B${currentRow}`).numberFormat = [["0.00%"]];
        sheet.getRange(`B${currentRow}`).format.horizontalAlignment = "Right";
        currentRow++;
      }
    });
    
    // Empty row before Cost Items (OpEx) Header
    sheet.getRange(`${currentRow}:${currentRow}`).format.rowHeight = 5;
    currentRow++;
    
    // Cost Items (OpEx) Header
    sheet.getRange(`A${currentRow}:B${currentRow}`).merge();
    sheet.getRange(`A${currentRow}`).values = [["Operating Expenses"]];
    sheet.getRange(`A${currentRow}`).format.font.bold = true;
    sheet.getRange(`A${currentRow}`).format.font.name = "Times New Roman";
    sheet.getRange(`A${currentRow}`).format.font.size = 12;
    sheet.getRange(`A${currentRow}`).format.font.color = "white";
    sheet.getRange(`A${currentRow}:B${currentRow}`).format.fill.color = "#1F3A5F";
    currentRow++;
    
    // OpEx items
    data.costItems.opex.forEach(item => {
      sheet.getRange(`A${currentRow}`).values = [[item.name]];
      sheet.getRange(`B${currentRow}`).values = [[item.value]];
      sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.name = "Times New Roman";
      sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.size = 12;
      sheet.getRange(`B${currentRow}`).numberFormat = [["#,##0"]];
      sheet.getRange(`B${currentRow}`).format.horizontalAlignment = "Right";
      currentRow++;
      
      // Add growth rate for Staff expenses
      if (item.name === 'Staff expenses' && item.growth) {
        sheet.getRange(`A${currentRow}`).values = [["Salary Growth (p.a.)"]];
        sheet.getRange(`B${currentRow}`).values = [[item.growth / 100]];
        sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.name = "Times New Roman";
        sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.size = 12;
        sheet.getRange(`B${currentRow}`).numberFormat = [["0.00%"]];
        sheet.getRange(`B${currentRow}`).format.horizontalAlignment = "Right";
        currentRow++;
      }
    });
    
    // OpEx Cost Inflation
    sheet.getRange(`A${currentRow}`).values = [["OpEx Cost Inflation"]];
    sheet.getRange(`B${currentRow}`).values = [[0.02]];
    sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.name = "Times New Roman";
    sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.size = 12;
    sheet.getRange(`B${currentRow}`).numberFormat = [["0.00%"]];
    sheet.getRange(`B${currentRow}`).format.horizontalAlignment = "Right";
    currentRow++;
    
    // Cost Items (CapEx) Header - only show if there are CapEx items
    if (data.costItems.capex.length > 0) {
      // Empty row before CapEx Header
      sheet.getRange(`${currentRow}:${currentRow}`).format.rowHeight = 5;
      currentRow++;
      
      sheet.getRange(`A${currentRow}:B${currentRow}`).merge();
      sheet.getRange(`A${currentRow}`).values = [["Cost Items (CapEx)"]];
      sheet.getRange(`A${currentRow}`).format.font.bold = true;
      sheet.getRange(`A${currentRow}`).format.font.name = "Times New Roman";
      sheet.getRange(`A${currentRow}`).format.font.size = 12;
      sheet.getRange(`A${currentRow}`).format.font.color = "white";
      sheet.getRange(`A${currentRow}:B${currentRow}`).format.fill.color = "#1F3A5F";
      currentRow++;
      
      // CapEx items
      data.costItems.capex.forEach(item => {
        sheet.getRange(`A${currentRow}`).values = [[item.name]];
        sheet.getRange(`B${currentRow}`).values = [[item.value]];
        sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.name = "Times New Roman";
        sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.size = 12;
        sheet.getRange(`B${currentRow}`).numberFormat = [["#,##0"]];
        sheet.getRange(`B${currentRow}`).format.horizontalAlignment = "Right";
        currentRow++;
      });
      
      // CapEx Cost Inflation
      sheet.getRange(`A${currentRow}`).values = [["CapEx Cost Inflation"]];
      sheet.getRange(`B${currentRow}`).values = [[0.015]];
      sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.name = "Times New Roman";
      sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.size = 12;
      sheet.getRange(`B${currentRow}`).numberFormat = [["0.00%"]];
      sheet.getRange(`B${currentRow}`).format.horizontalAlignment = "Right";
      currentRow++;
    }
    
    // Empty row before Total Fixed Costs
    currentRow += 1;
    sheet.getRange(`${currentRow}:${currentRow}`).format.rowHeight = 5;
    currentRow += 1;
    
    // Total Fixed Costs
    sheet.getRange(`A${currentRow}`).values = [["Total Fixed Costs"]];
    sheet.getRange(`B${currentRow}`).values = [[2000]];
    sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.name = "Times New Roman";
    sheet.getRange(`A${currentRow}:B${currentRow}`).format.font.size = 12;
    sheet.getRange(`B${currentRow}`).numberFormat = [["#,##0"]];
    sheet.getRange(`B${currentRow}`).format.horizontalAlignment = "Right";
    currentRow++;
    
    // Empty row before Exit Assumptions
    currentRow += 1;
    sheet.getRange(`${currentRow}:${currentRow}`).format.rowHeight = 5;
    currentRow += 1;
    
    // Exit Assumptions Header
    sheet.getRange(`A${currentRow}:B${currentRow}`).merge();
    sheet.getRange(`A${currentRow}`).values = [["Exit Assumptions"]];
    sheet.getRange(`A${currentRow}`).format.font.bold = true;
    sheet.getRange(`A${currentRow}`).format.font.name = "Times New Roman";
    sheet.getRange(`A${currentRow}`).format.font.size = 12;
    sheet.getRange(`A${currentRow}`).format.font.color = "white";
    sheet.getRange(`A${currentRow}:B${currentRow}`).format.fill.color = "#1F3A5F";
    currentRow++;
    
    // Exit data
    sheet.getRange(`A${currentRow}`).values = [["Disposal Costs"]];
    sheet.getRange(`B${currentRow}`).values = [[data.disposalCost / 100]];
    sheet.getRange(`B${currentRow}`).numberFormat = [["0.00%"]];
    // Removed orange highlight
    sheet.getRange(`B${currentRow}`).format.horizontalAlignment = "Right";
    currentRow++;
    
    sheet.getRange(`A${currentRow}`).values = [["Terminal Cap Rate"]];
    sheet.getRange(`B${currentRow}`).values = [[data.terminalCapRate / 100]];
    sheet.getRange(`B${currentRow}`).numberFormat = [["0.00%"]];
    // Removed orange highlight
    sheet.getRange(`B${currentRow}`).format.horizontalAlignment = "Right";
    currentRow++;
    
    sheet.getRange(`A${currentRow}`).values = [["Terminal NOI"]];
    sheet.getRange(`B${currentRow}`).values = [[""]]; // Leave blank
    currentRow++;
    
    sheet.getRange(`A${currentRow}`).values = [["Sale Price"]];
    sheet.getRange(`B${currentRow}`).values = [[""]]; // Leave blank
    currentRow++;
    
    // Format column widths
    sheet.getRange("A:A").format.columnWidth = 200;
    sheet.getRange("B:B").format.columnWidth = 150;
    
    // Add borders to all data
    const dataRange = sheet.getRange(`A5:B${currentRow - 1}`);
    dataRange.format.borders.getItem('EdgeTop').style = 'Thin';
    dataRange.format.borders.getItem('EdgeBottom').style = 'Thin';
    dataRange.format.borders.getItem('EdgeLeft').style = 'Thin';
    dataRange.format.borders.getItem('EdgeRight').style = 'Thin';
    dataRange.format.borders.getItem('InsideHorizontal').style = 'Thin';
    dataRange.format.borders.getItem('InsideVertical').style = 'Thin';
  }

  async createProfitLossLayout(context, sheet, data) {
    console.log('P&L Layout: Starting with data:', data);
    
    // Initialize cell tracker for P&L sheet
    this.cellTracker = new CellReferenceTracker();
    
    // Calculate periods and dates
    const projectStartDate = new Date(data.projectStartDate);
    const projectEndDate = new Date(data.projectEndDate);
    const modelPeriods = data.modelPeriods === 'monthly' ? 1 : 
                        data.modelPeriods === 'quarterly' ? 3 : 12;
    
    console.log('P&L Layout: Dates and periods:', { projectStartDate, projectEndDate, modelPeriods });
    
    // Calculate total number of periods based on actual period type
    const totalMonths = (projectEndDate.getFullYear() - projectStartDate.getFullYear()) * 12 + 
                       (projectEndDate.getMonth() - projectStartDate.getMonth()) + 1;
    let totalPeriods = Math.ceil(totalMonths / modelPeriods);
    
    // Limit to maximum 20 periods to avoid Excel column limits
    totalPeriods = Math.min(totalPeriods, 20);
    
    console.log('P&L Layout: Calculated periods:', { totalMonths, totalPeriods });
    
    // Clear any existing content
    try {
      const usedRange = sheet.getUsedRange();
      if (usedRange) {
        usedRange.clear();
      }
    } catch (e) {
      console.log('No content to clear in P&L sheet');
    }
    
    // Set up title and headers
    sheet.getRange("A1").values = [["Profit & Loss Statement"]];
    sheet.getRange("A1").format.font.bold = true;
    sheet.getRange("A1").format.font.name = "Times New Roman";
    sheet.getRange("A1").format.font.size = 16;
    sheet.getRange("A1").format.horizontalAlignment = "Center";
    // Merge title cells using a simpler approach
    const titleRange = sheet.getRange(`A1:${String.fromCharCode(65 + totalPeriods)}1`);
    titleRange.merge();
    
    let currentRow = 3;
    
    // Period row
    sheet.getRange("A" + currentRow).values = [["Period"]];
    sheet.getRange("A" + currentRow).format.font.bold = true;
    sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
    sheet.getRange("A" + currentRow).format.font.size = 12;
    
    // Generate period headers (1, 2, 3, etc.)
    for (let period = 1; period <= totalPeriods; period++) {
      const col = String.fromCharCode(65 + period); // B, C, D, etc.
      console.log(`P&L Layout: Creating period header ${period} in column ${col}`);
      sheet.getRange(col + currentRow).values = [[period]];
      sheet.getRange(col + currentRow).format.font.bold = true;
      sheet.getRange(col + currentRow).format.font.name = "Times New Roman";
      sheet.getRange(col + currentRow).format.font.size = 12;
      sheet.getRange(col + currentRow).format.horizontalAlignment = "Center";
    }
    
    console.log('P&L Layout: Period headers created successfully');
    
    currentRow++;
    
    // Date headers
    sheet.getRange("A" + currentRow).values = [[""]];
    for (let period = 1; period <= totalPeriods; period++) {
      const col = String.fromCharCode(65 + period); // B, C, D, etc.
      
      // Calculate date for this period
      const periodDate = new Date(projectStartDate);
      if (data.modelPeriods === 'monthly') {
        periodDate.setMonth(periodDate.getMonth() + period - 1);
      } else if (data.modelPeriods === 'quarterly') {
        periodDate.setMonth(periodDate.getMonth() + (period - 1) * 3);
      } else {
        periodDate.setFullYear(periodDate.getFullYear() + period - 1);
      }
      
      const dateStr = this.formatDateHeader(periodDate);
      
      sheet.getRange(col + currentRow).values = [[dateStr]];
      sheet.getRange(col + currentRow).format.font.name = "Times New Roman";
      sheet.getRange(col + currentRow).format.font.size = 10;
      sheet.getRange(col + currentRow).format.horizontalAlignment = "Center";
      sheet.getRange(col + currentRow).format.font.color = "#666666";
    }
    
    currentRow += 2; // Add spacing
    
    // Revenue Items Section
    sheet.getRange("A" + currentRow).values = [["Revenue Items"]];
    sheet.getRange("A" + currentRow).format.font.bold = true;
    sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
    sheet.getRange("A" + currentRow).format.font.size = 12;
    sheet.getRange("A" + currentRow).format.font.color = "white";
    sheet.getRange(`A${currentRow}:${String.fromCharCode(65 + totalPeriods)}${currentRow}`).format.fill.color = "#5FB7B8";
    
    // Track revenue section start
    const revenueStartRow = currentRow + 1;
    currentRow++;
    
    // Add revenue items with formulas
    data.revenueItems.forEach((item, index) => {
      sheet.getRange("A" + currentRow).values = [[item.name]];
      sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
      sheet.getRange("A" + currentRow).format.font.size = 12;
      
      // Track this revenue item in our cell tracker
      this.cellTracker.trackAssumptionCell(`${item.name}_Value`, `Assumptions!C${this.getRevenueItemAssumptionRow(index)}`, 'ProfitLoss');
      this.cellTracker.trackAssumptionCell(`${item.name}_Growth`, `Assumptions!D${this.getRevenueItemAssumptionRow(index)}`, 'ProfitLoss');
      
      // Create formulas for each period
      const baseValueRef = this.cellTracker.getReference(`${item.name}_Value`, 'ProfitLoss');
      const growthRef = this.cellTracker.getReference(`${item.name}_Growth`, 'ProfitLoss');
      
      for (let period = 1; period <= totalPeriods; period++) {
        const col = String.fromCharCode(65 + period);
        
        if (period === 1) {
          // First period uses base value from assumptions
          sheet.getRange(col + currentRow).formulas = [[`=${baseValueRef || 'Assumptions!C' + this.getRevenueItemAssumptionRow(index)}`]];
        } else {
          // Subsequent periods apply growth
          const prevCol = String.fromCharCode(65 + period - 1);
          
          if (item.growthType === 'linear') {
            sheet.getRange(col + currentRow).formulas = [[`=${prevCol}${currentRow}*(1+(${growthRef || 'Assumptions!D' + this.getRevenueItemAssumptionRow(index)})/100)`]];
          } else {
            // For non-linear growth, use the base value reference
            sheet.getRange(col + currentRow).formulas = [[`=${baseValueRef || 'Assumptions!C' + this.getRevenueItemAssumptionRow(index)}`]];
          }
        }
        
        sheet.getRange(col + currentRow).numberFormat = [["#,##0"]];
        sheet.getRange(col + currentRow).format.horizontalAlignment = "Right";
        sheet.getRange(col + currentRow).format.font.name = "Times New Roman";
        sheet.getRange(col + currentRow).format.font.size = 12;
      }
      
      currentRow++;
    });
    
    // Total Revenue
    sheet.getRange("A" + currentRow).values = [["Total Revenue"]];
    sheet.getRange("A" + currentRow).format.font.bold = true;
    sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
    sheet.getRange("A" + currentRow).format.font.size = 12;
    sheet.getRange("A" + currentRow).format.fill.color = "#E8F4F8";
    
    // Track total revenue row for later reference
    const totalRevenueRow = currentRow;
    this.cellTracker.trackAssumptionCell('TotalRevenue', `B${currentRow}`, 'ProfitLoss');
    
    for (let period = 1; period <= totalPeriods; period++) {
      const col = String.fromCharCode(65 + period);
      const startRow = revenueStartRow;
      const endRow = currentRow - 1;
      sheet.getRange(col + currentRow).formulas = [[`=SUM(${col}${startRow}:${col}${endRow})`]];
      sheet.getRange(col + currentRow).numberFormat = [["#,##0"]];
      sheet.getRange(col + currentRow).format.horizontalAlignment = "Right";
      sheet.getRange(col + currentRow).format.font.bold = true;
      sheet.getRange(col + currentRow).format.font.name = "Times New Roman";
      sheet.getRange(col + currentRow).format.font.size = 12;
      sheet.getRange(col + currentRow).format.fill.color = "#E8F4F8";
    }
    
    currentRow += 2; // Add spacing
    
    // Operating Expenses Section
    sheet.getRange("A" + currentRow).values = [["Operating Expenses"]];
    sheet.getRange("A" + currentRow).format.font.bold = true;
    sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
    sheet.getRange("A" + currentRow).format.font.size = 12;
    sheet.getRange("A" + currentRow).format.font.color = "white";
    sheet.getRange(`A${currentRow}:${String.fromCharCode(65 + totalPeriods)}${currentRow}`).format.fill.color = "#5FB7B8";
    
    // Track operating expenses section start
    const opExStartRow = currentRow + 1;
    currentRow++;
    
    // Add operating expenses
    if (data.costItems && data.costItems.opex) {
      data.costItems.opex.forEach((item, index) => {
        sheet.getRange("A" + currentRow).values = [[item.name]];
        sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
        sheet.getRange("A" + currentRow).format.font.size = 12;
        
        // Track this operating expense in our cell tracker
        this.cellTracker.trackAssumptionCell(`${item.name}_OpEx_Value`, `Assumptions!C${this.getOpExItemAssumptionRow(index)}`, 'ProfitLoss');
        this.cellTracker.trackAssumptionCell(`${item.name}_OpEx_Growth`, `Assumptions!D${this.getOpExItemAssumptionRow(index)}`, 'ProfitLoss');
        
        // Create formulas for each period
        const baseValueRef = this.cellTracker.getReference(`${item.name}_OpEx_Value`, 'ProfitLoss');
        const growthRef = this.cellTracker.getReference(`${item.name}_OpEx_Growth`, 'ProfitLoss');
        
        for (let period = 1; period <= totalPeriods; period++) {
          const col = String.fromCharCode(65 + period);
          
          if (period === 1) {
            // First period uses base value from assumptions
            sheet.getRange(col + currentRow).formulas = [[`=-ABS(${baseValueRef || 'Assumptions!C' + this.getOpExItemAssumptionRow(index)})`]];
          } else {
            // Subsequent periods apply inflation/growth
            const prevCol = String.fromCharCode(65 + period - 1);
            
            if (item.growthType === 'linear') {
              sheet.getRange(col + currentRow).formulas = [[`=${prevCol}${currentRow}*(1+(${growthRef || 'Assumptions!D' + this.getOpExItemAssumptionRow(index)})/100)`]];
            } else {
              // For non-linear growth, use the base value reference
              sheet.getRange(col + currentRow).formulas = [[`=-ABS(${baseValueRef || 'Assumptions!C' + this.getOpExItemAssumptionRow(index)})`]];
            }
          }
          
          sheet.getRange(col + currentRow).numberFormat = [["(#,##0)"]];
          sheet.getRange(col + currentRow).format.horizontalAlignment = "Right";
          sheet.getRange(col + currentRow).format.font.name = "Times New Roman";
          sheet.getRange(col + currentRow).format.font.size = 12;
          sheet.getRange(col + currentRow).format.font.color = "red";
        }
        
        currentRow++;
      });
    }
    
    // Total Operating Expenses
    sheet.getRange("A" + currentRow).values = [["Total Operating Expenses"]];
    sheet.getRange("A" + currentRow).format.font.bold = true;
    sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
    sheet.getRange("A" + currentRow).format.font.size = 12;
    sheet.getRange("A" + currentRow).format.fill.color = "#E8F4F8";
    
    // Track total operating expenses row
    const totalOpExRow = currentRow;
    this.cellTracker.trackAssumptionCell('TotalOpEx', `B${currentRow}`, 'ProfitLoss');
    
    for (let period = 1; period <= totalPeriods; period++) {
      const col = String.fromCharCode(65 + period);
      const startRow = opExStartRow;
      const endRow = currentRow - 1;
      sheet.getRange(col + currentRow).formulas = [[`=SUM(${col}${startRow}:${col}${endRow})`]];
      sheet.getRange(col + currentRow).numberFormat = [["(#,##0)"]];
      sheet.getRange(col + currentRow).format.horizontalAlignment = "Right";
      sheet.getRange(col + currentRow).format.font.bold = true;
      sheet.getRange(col + currentRow).format.font.name = "Times New Roman";
      sheet.getRange(col + currentRow).format.font.size = 12;
      sheet.getRange(col + currentRow).format.fill.color = "#E8F4F8";
      sheet.getRange(col + currentRow).format.font.color = "red";
    }
    
    currentRow += 2; // Add spacing
    
    // EBITDA
    sheet.getRange("A" + currentRow).values = [["EBITDA"]];
    sheet.getRange("A" + currentRow).format.font.bold = true;
    sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
    sheet.getRange("A" + currentRow).format.font.size = 12;
    sheet.getRange("A" + currentRow).format.fill.color = "#5FB7B8";
    sheet.getRange("A" + currentRow).format.font.color = "white";
    
    // Track EBITDA row for FCF linking
    this.plEBITDARow = currentRow;
    this.cellTracker.trackAssumptionCell('EBITDA', `B${currentRow}`, 'ProfitLoss');
    
    for (let period = 1; period <= totalPeriods; period++) {
      const col = String.fromCharCode(65 + period);
      sheet.getRange(col + currentRow).formulas = [[`=${col}${totalRevenueRow}+${col}${totalOpExRow}`]];
      sheet.getRange(col + currentRow).numberFormat = [["#,##0;(#,##0)"]];
      sheet.getRange(col + currentRow).format.horizontalAlignment = "Right";
      sheet.getRange(col + currentRow).format.font.bold = true;
      sheet.getRange(col + currentRow).format.font.name = "Times New Roman";
      sheet.getRange(col + currentRow).format.font.size = 12;
      sheet.getRange(col + currentRow).format.fill.color = "#5FB7B8";
      sheet.getRange(col + currentRow).format.font.color = "white";
    }
    
    currentRow += 2; // Add spacing
    
    // Capital Expenses Section (if any)
    if (data.costItems && data.costItems.capex && data.costItems.capex.length > 0) {
      sheet.getRange("A" + currentRow).values = [["Capital Expenses"]];
      sheet.getRange("A" + currentRow).format.font.bold = true;
      sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
      sheet.getRange("A" + currentRow).format.font.size = 12;
      sheet.getRange("A" + currentRow).format.font.color = "white";
      sheet.getRange(`A${currentRow}:${String.fromCharCode(65 + totalPeriods)}${currentRow}`).format.fill.color = "#5FB7B8";
      
      const capExStartRow = currentRow + 1;
      currentRow++;
      
      // Add capital expenses
      data.costItems.capex.forEach((item, index) => {
        sheet.getRange("A" + currentRow).values = [[item.name]];
        sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
        sheet.getRange("A" + currentRow).format.font.size = 12;
        
        // Track this capital expense in our cell tracker
        this.cellTracker.trackAssumptionCell(`${item.name}_CapEx_Value`, `Assumptions!C${this.getCapExItemAssumptionRow(index)}`, 'ProfitLoss');
        
        // Create formulas for each period
        for (let period = 1; period <= totalPeriods; period++) {
          const col = String.fromCharCode(65 + period);
          const baseValueRef = this.cellTracker.getReference(`${item.name}_CapEx_Value`, 'ProfitLoss');
          sheet.getRange(col + currentRow).formulas = [[`=-ABS(${baseValueRef || 'Assumptions!C' + this.getCapExItemAssumptionRow(index)})`]];
          sheet.getRange(col + currentRow).numberFormat = [["(#,##0)"]];
          sheet.getRange(col + currentRow).format.horizontalAlignment = "Right";
          sheet.getRange(col + currentRow).format.font.name = "Times New Roman";
          sheet.getRange(col + currentRow).format.font.size = 12;
          sheet.getRange(col + currentRow).format.font.color = "red";
        }
        
        currentRow++;
      });
      
      // Total Capital Expenses
      sheet.getRange("A" + currentRow).values = [["Total Capital Expenses"]];
      sheet.getRange("A" + currentRow).format.font.bold = true;
      sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
      sheet.getRange("A" + currentRow).format.font.size = 12;
      sheet.getRange("A" + currentRow).format.fill.color = "#E8F4F8";
      
      for (let period = 1; period <= totalPeriods; period++) {
        const col = String.fromCharCode(65 + period);
        const startRow = capExStartRow;
        const endRow = currentRow - 1;
        sheet.getRange(col + currentRow).formulas = [[`=SUM(${col}${startRow}:${col}${endRow})`]];
        sheet.getRange(col + currentRow).numberFormat = [["(#,##0)"]];
        sheet.getRange(col + currentRow).format.horizontalAlignment = "Right";
        sheet.getRange(col + currentRow).format.font.bold = true;
        sheet.getRange(col + currentRow).format.font.name = "Times New Roman";
        sheet.getRange(col + currentRow).format.font.size = 12;
        sheet.getRange(col + currentRow).format.fill.color = "#E8F4F8";
        sheet.getRange(col + currentRow).format.font.color = "red";
      }
      
      currentRow += 2;
    }
    
    // Format column widths
    sheet.getRange("A:A").format.columnWidth = 200;
    for (let period = 1; period <= totalPeriods; period++) {
      const col = String.fromCharCode(65 + period);
      sheet.getRange(`${col}:${col}`).format.columnWidth = 120;
    }
    
    // Add borders to all data
    const dataRange = sheet.getRange(`A1:${String.fromCharCode(65 + totalPeriods)}${currentRow}`);
    dataRange.format.borders.getItem('EdgeTop').style = 'Thin';
    dataRange.format.borders.getItem('EdgeBottom').style = 'Thin';
    dataRange.format.borders.getItem('EdgeLeft').style = 'Thin';
    dataRange.format.borders.getItem('EdgeRight').style = 'Thin';
    dataRange.format.borders.getItem('InsideHorizontal').style = 'Thin';
    dataRange.format.borders.getItem('InsideVertical').style = 'Thin';
  }

  // Helper functions to get assumption row references
  getRevenueItemAssumptionRow(itemIndex) {
    // Revenue items start at row 30 in Assumptions sheet
    return 30 + itemIndex;
  }

  getOpExItemAssumptionRow(itemIndex) {
    // Operating expenses start at row 40 in Assumptions sheet
    return 40 + itemIndex;
  }

  getCapExItemAssumptionRow(itemIndex) {
    // Capital expenses start at row 50 in Assumptions sheet
    return 50 + itemIndex;
  }

  // Helper function to get row references from Assumptions sheet (legacy support)
  getAssumptionsRowReference(itemName, type) {
    // This is a simplified approach - in practice, you'd want to track actual row positions
    // Based on the typical structure of the assumptions sheet
    const baseRows = {
      revenue: 30, // Starting row for revenue items
      opex: 40,    // Starting row for operating expenses  
      capex: 50,   // Starting row for capital expenses
      assumptions: 10 // Starting row for general assumptions
    };
    
    return baseRows[type] || 20; // Default fallback
  }

  // Helper function to get growth rate references (legacy support)
  getAssumptionsGrowthReference(itemName, type) {
    // Return the row number for growth rates
    const growthRows = {
      revenue: 31, // Revenue growth row
      opex: 41,    // OpEx inflation row
      capex: 51    // CapEx inflation row
    };
    
    return growthRows[type] || 21; // Default fallback
  }

  // Format date header for different period types
  formatDateHeader(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()}-${months[date.getMonth()]}-${date.getFullYear().toString().substr(-2)}`;
  }
  
  // Create Cashflows Layout
  async createCashflowsLayout(context, sheet, modelData) {
    console.log('Creating Cashflows layout with data:', modelData);
    
    // Clear any existing content
    try {
      const usedRange = sheet.getUsedRange();
      if (usedRange) {
        usedRange.clear();
      }
    } catch (e) {
      console.log('No content to clear in FCF sheet');
    }
    
    // Get total periods from model data
    const startDate = new Date(modelData.projectStartDate);
    const endDate = new Date(modelData.projectEndDate);
    const totalPeriods = this.calculatePeriods(startDate, endDate, modelData.modelPeriods);
    
    console.log(`Total periods calculated: ${totalPeriods}`);
    
    // Title
    sheet.getRange("A1").values = [["Cashflows"]];
    sheet.getRange("A1").format.font.bold = true;
    sheet.getRange("A1").format.font.size = 14;
    sheet.getRange("A1").format.font.name = "Times New Roman";
    
    let currentRow = 3;
    
    // Period headers using simpler approach
    for (let i = 1; i <= totalPeriods; i++) {
      const col = String.fromCharCode(65 + i); // B, C, D, etc.
      const periodDate = new Date(startDate);
      if (modelData.modelPeriods === 'monthly') {
        periodDate.setMonth(periodDate.getMonth() + i - 1);
      } else if (modelData.modelPeriods === 'quarterly') {
        periodDate.setMonth(periodDate.getMonth() + (i - 1) * 3);
      } else {
        periodDate.setFullYear(periodDate.getFullYear() + i - 1);
      }
      const dateStr = this.formatDateHeader(periodDate);
      sheet.getRange(col + (currentRow - 1)).values = [[dateStr]];
      sheet.getRange(col + (currentRow - 1)).format.font.bold = true;
      sheet.getRange(col + (currentRow - 1)).format.horizontalAlignment = "Center";
      sheet.getRange(col + (currentRow - 1)).format.font.name = "Times New Roman";
    }
    
    // Period numbers
    sheet.getRange("A" + currentRow).values = [["Period"]];
    sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
    
    for (let period = 1; period <= totalPeriods; period++) {
      const col = String.fromCharCode(65 + period);
      sheet.getRange(col + currentRow).values = [[period]];
      sheet.getRange(col + currentRow).format.horizontalAlignment = "Center";
      sheet.getRange(col + currentRow).format.font.name = "Times New Roman";
    }
    currentRow++;
    
    // Purchase price
    sheet.getRange("A" + currentRow).values = [["Purchase price"]];
    sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
    sheet.getRange("B" + currentRow).values = [[modelData.dealValue ? -modelData.dealValue : 0]];
    sheet.getRange("B" + currentRow).numberFormat = [["(#,##0)"]];
    sheet.getRange("B" + currentRow).format.font.color = "red";
    this.cellTracker.trackAssumptionCell('PurchasePrice', `B${currentRow}`, 'Cashflows');
    currentRow++;
    
    // Transaction costs
    sheet.getRange("A" + currentRow).values = [["Transaction costs"]];
    sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
    const transactionCost = modelData.dealValue * (modelData.transactionFee / 100);
    sheet.getRange("B" + currentRow).values = [[-transactionCost]];
    sheet.getRange("B" + currentRow).numberFormat = [["(#,##0)"]];
    sheet.getRange("B" + currentRow).format.font.color = "red";
    currentRow++;
    
    // EBITDA row
    sheet.getRange("A" + currentRow).values = [["EBITDA"]];
    sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
    
    // Link EBITDA from P&L
    for (let period = 1; period <= totalPeriods; period++) {
      const col = String.fromCharCode(65 + period);
      // We'll need to track the EBITDA row from P&L
      sheet.getRange(col + currentRow).formulas = [[`=ProfitLoss!${col}${this.plEBITDARow || 30}`]];
      sheet.getRange(col + currentRow).numberFormat = [["#,##0"]];
    }
    currentRow++;
    
    // Sale Price (at exit)
    sheet.getRange("A" + currentRow).values = [["Sale Price"]];
    sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
    
    // Calculate exit value using terminal cap rate
    const lastPeriodCol = String.fromCharCode(65 + totalPeriods);
    const exitFormula = `=${lastPeriodCol}${currentRow - 1}/${this.cellTracker.getReference('terminalCapRate', 'Cashflows') || 'Assumptions!B20'}*100`;
    sheet.getRange(lastPeriodCol + currentRow).formulas = [[exitFormula]];
    sheet.getRange(lastPeriodCol + currentRow).numberFormat = [["#,##0"]];
    currentRow++;
    
    // Disposal Costs
    sheet.getRange("A" + currentRow).values = [["Disposal Costs"]];
    sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
    const disposalFormula = `=-${lastPeriodCol}${currentRow - 1}*${this.cellTracker.getReference('disposalCost', 'Cashflows') || 'Assumptions!B19'}/100`;
    sheet.getRange(lastPeriodCol + currentRow).formulas = [[disposalFormula]];
    sheet.getRange(lastPeriodCol + currentRow).numberFormat = [["(#,##0)"]];
    sheet.getRange(lastPeriodCol + currentRow).format.font.color = "red";
    currentRow += 2;
    
    // Unlevered Cashflows header
    sheet.getRange("A" + currentRow).values = [["Unlevered Cashflows"]];
    sheet.getRange("A" + currentRow).format.font.bold = true;
    sheet.getRange("A" + currentRow).format.fill.color = "#5FB7B8";
    sheet.getRange("A" + currentRow).format.font.color = "white";
    sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
    
    // Fill unlevered header background
    const unleveredHeaderRange = sheet.getRange(`B${currentRow - 1}:${String.fromCharCode(65 + totalPeriods)}${currentRow - 1}`);
    unleveredHeaderRange.format.fill.color = "#5FB7B8";
    currentRow++;
    
    // Unlevered cashflow calculations
    const unleveredRow = currentRow;
    for (let period = 1; period <= totalPeriods; period++) {
      const col = String.fromCharCode(65 + period);
      // Sum all cashflows for this period
      const startRow = 4; // Starting from Purchase price row
      const endRow = currentRow - 3; // Up to disposal costs
      sheet.getRange(col + currentRow).formulas = [[`=SUM(${col}${startRow}:${col}${endRow})`]];
      sheet.getRange(col + currentRow).numberFormat = [["#,##0;(#,##0)"]];
    }
    currentRow += 2;
    
    // Debt section
    if (modelData.hasDebt || modelData.acquisitionLTV > 0) {
      // Debt header
      sheet.getRange("A" + currentRow).values = [["Debt"]];
      sheet.getRange("A" + currentRow).format.font.bold = true;
      sheet.getRange("A" + currentRow).format.fill.color = "#5FB7B8";
      sheet.getRange("A" + currentRow).format.font.color = "white";
      sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
      
      // Fill debt header background  
      const debtHeaderRange = sheet.getRange(`B${currentRow - 1}:${String.fromCharCode(65 + totalPeriods)}${currentRow - 1}`);
      debtHeaderRange.format.fill.color = "#5FB7B8";
      currentRow++;
      
      // Debt drawn
      sheet.getRange("A" + currentRow).values = [["Debt drawn"]];
      sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
      const debtAmount = modelData.dealValue * (modelData.acquisitionLTV / 100);
      sheet.getRange("B" + currentRow).values = [[debtAmount]];
      sheet.getRange("B" + currentRow).numberFormat = [["#,##0"]];
      currentRow++;
      
      // Debt upfront costs
      sheet.getRange("A" + currentRow).values = [["Debt upfront costs"]];
      sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
      const debtCosts = debtAmount * 0.01; // 1% issuance fee
      sheet.getRange("B" + currentRow).values = [[-debtCosts]];
      sheet.getRange("B" + currentRow).numberFormat = [["(#,##0)"]];
      sheet.getRange("B" + currentRow).format.font.color = "red";
      currentRow++;
      
      // Interest Expense
      sheet.getRange("A" + currentRow).values = [["Interest Expense"]];
      sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
      
      // Monthly interest payments
      const monthlyInterest = debtAmount * 0.055 / 12; // 5.5% annual rate
      for (let period = 2; period <= totalPeriods; period++) {
        const col = String.fromCharCode(65 + period);
        sheet.getRange(col + currentRow).values = [[-monthlyInterest]];
        sheet.getRange(col + currentRow).numberFormat = [["(#,##0)"]];
        sheet.getRange(col + currentRow).format.font.color = "red";
      }
      currentRow++;
      
      // Debt repaid
      sheet.getRange("A" + currentRow).values = [["Debt repaid (interest-only-loan)"]];
      sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
      sheet.getRange(lastPeriodCol + currentRow).values = [[-debtAmount]];
      sheet.getRange(lastPeriodCol + currentRow).numberFormat = [["(#,##0)"]];
      sheet.getRange(lastPeriodCol + currentRow).format.font.color = "red";
      currentRow++;
      
      // Levered Cashflows
      currentRow++;
      sheet.getRange("A" + currentRow).values = [["Levered Cashflows"]];
      sheet.getRange("A" + currentRow).format.font.bold = true;
      sheet.getRange("A" + currentRow).format.fill.color = "#5FB7B8";
      sheet.getRange("A" + currentRow).format.font.color = "white";
      sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
      
      // Fill levered header background
      const leveredHeaderRange = sheet.getRange(`B${currentRow - 1}:${String.fromCharCode(65 + totalPeriods)}${currentRow - 1}`);
      leveredHeaderRange.format.fill.color = "#5FB7B8";
      currentRow++;
      
      // Calculate levered cashflows
      for (let period = 1; period <= totalPeriods; period++) {
        const col = String.fromCharCode(65 + period);
        sheet.getRange(col + currentRow).formulas = [[`=${col}${unleveredRow}+SUM(${col}${currentRow-5}:${col}${currentRow-2})`]];
        sheet.getRange(col + currentRow).numberFormat = [["#,##0;(#,##0)"]];
      }
      currentRow += 2;
      
      // Equity section
      sheet.getRange("A" + currentRow).values = [["Equity contributed"]];
      sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
      const equityAmount = modelData.dealValue - debtAmount;
      sheet.getRange("B" + currentRow).values = [[equityAmount]];
      sheet.getRange("B" + currentRow).numberFormat = [["#,##0"]];
      currentRow++;
      
      sheet.getRange("A" + currentRow).values = [["Equity distributions"]];
      sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
      // Copy levered cashflows
      for (let period = 1; period <= totalPeriods; period++) {
        const col = String.fromCharCode(65 + period);
        sheet.getRange(col + currentRow).formulas = [[`=${col}${currentRow - 3}`]];
        sheet.getRange(col + currentRow).numberFormat = [["#,##0;(#,##0)"]];
      }
      currentRow += 2;
      
      // IRR Calculations
      sheet.getRange("A" + currentRow).values = [["Unlevered IRR"]];
      sheet.getRange("A" + currentRow).format.font.bold = true;
      sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
      sheet.getRange("B" + currentRow).formulas = [[`=IRR(B${unleveredRow}:${lastPeriodCol}${unleveredRow})`]];
      sheet.getRange("B" + currentRow).numberFormat = [["0.0%"]];
      currentRow++;
      
      sheet.getRange("A" + currentRow).values = [["Levered IRR"]];
      sheet.getRange("A" + currentRow).format.font.bold = true;
      sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
      sheet.getRange("B" + currentRow).formulas = [[`=IRR(B${currentRow - 4}:${lastPeriodCol}${currentRow - 4})`]];
      sheet.getRange("B" + currentRow).numberFormat = [["0.0%"]];
      currentRow++;
      
      sheet.getRange("A" + currentRow).values = [["MOIC"]];
      sheet.getRange("A" + currentRow).format.font.bold = true;
      sheet.getRange("A" + currentRow).format.font.name = "Times New Roman";
      const moicFormula = `=SUM(C${currentRow - 6}:${lastPeriodCol}${currentRow - 6})/B${currentRow - 6}`;
      sheet.getRange("B" + currentRow).formulas = [[moicFormula]];
      sheet.getRange("B" + currentRow).numberFormat = [["0.0x"]];
    }
    
    // Format column widths
    sheet.getRange("A:A").format.columnWidth = 200;
    for (let period = 1; period <= totalPeriods; period++) {
      const col = String.fromCharCode(65 + period);
      sheet.getRange(`${col}:${col}`).format.columnWidth = 100;
    }
    
    // Add borders to all data
    const dataRange = sheet.getRange(`A1:${String.fromCharCode(65 + totalPeriods)}${currentRow}`);
    dataRange.format.borders.getItem('EdgeTop').style = 'Thin';
    dataRange.format.borders.getItem('EdgeBottom').style = 'Thin';
    dataRange.format.borders.getItem('EdgeLeft').style = 'Thin';
    dataRange.format.borders.getItem('EdgeRight').style = 'Thin';
    dataRange.format.borders.getItem('InsideHorizontal').style = 'Thin';
    dataRange.format.borders.getItem('InsideVertical').style = 'Thin';
  }
  
  // Calculate periods between dates
  calculatePeriods(startDate, endDate, periodType) {
    const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                      (endDate.getMonth() - startDate.getMonth()) + 1;
    
    if (periodType === 'monthly') {
      return monthsDiff;
    } else if (periodType === 'quarterly') {
      return Math.ceil(monthsDiff / 3);
    } else {
      return Math.ceil(monthsDiff / 12);
    }
  }

  async validateModel() {
    console.log('Validate model clicked');
    this.addChatMessage('assistant', 'Model validation feature coming soon! This will check all formulas and cross-references for accuracy.');
  }

  async saveData() {
    console.log('Save data clicked');
    
    try {
      // Collect all form data
      const formData = this.collectAllFormData();
      
      // Save to localStorage
      localStorage.setItem('maModelingData', JSON.stringify(formData));
      
      // Show success message
      this.showSaveStatus('Data saved successfully!', 'success');
      
      console.log('Data saved to localStorage');
      
    } catch (error) {
      console.error('Error saving data:', error);
      this.showSaveStatus('Error saving data: ' + error.message, 'error');
    }
  }

  async loadData() {
    console.log('Load data clicked');
    
    try {
      // Get data from localStorage
      const savedData = localStorage.getItem('maModelingData');
      
      if (!savedData) {
        this.showSaveStatus('No saved data found', 'error');
        return;
      }
      
      const formData = JSON.parse(savedData);
      
      // Populate all form fields
      this.populateAllFormData(formData);
      
      // Show success message
      this.showSaveStatus('Data loaded successfully!', 'success');
      
      console.log('Data loaded from localStorage');
      
    } catch (error) {
      console.error('Error loading data:', error);
      this.showSaveStatus('Error loading data: ' + error.message, 'error');
    }
  }

  showSaveStatus(message, type) {
    const statusElement = document.getElementById('saveStatus');
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.className = `save-status ${type}`;
      
      // Clear message after 3 seconds
      setTimeout(() => {
        statusElement.textContent = '';
        statusElement.className = 'save-status';
      }, 3000);
    }
  }

  collectAllFormData() {
    const data = {};
    
    // Collect all input values
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      if (input.id) {
        if (input.type === 'checkbox' || input.type === 'radio') {
          data[input.id] = input.checked;
        } else {
          data[input.id] = input.value;
        }
      }
    });
    
    // Collect dynamic items (revenue items, operating expenses, capital expenses)
    data.revenueItems = this.collectRevenueItems();
    data.operatingExpenses = this.collectOperatingExpenses();
    data.capitalExpenses = this.collectCapitalExpenses();
    data.costItems = this.collectCostItems(); // Legacy support
    
    // Add timestamp
    data.savedAt = new Date().toISOString();
    
    return data;
  }

  populateAllFormData(data) {
    // Populate basic form fields
    Object.keys(data).forEach(key => {
      const element = document.getElementById(key);
      if (element && !['revenueItems', 'operatingExpenses', 'capitalExpenses', 'costItems', 'savedAt'].includes(key)) {
        if (element.type === 'checkbox' || element.type === 'radio') {
          element.checked = data[key];
        } else {
          element.value = data[key];
        }
      }
    });
    
    // Populate dynamic items
    if (data.revenueItems) {
      this.populateRevenueItems(data.revenueItems);
    }
    
    if (data.operatingExpenses) {
      this.populateOperatingExpenses(data.operatingExpenses);
    }
    
    if (data.capitalExpenses) {
      this.populateCapitalExpenses(data.capitalExpenses);
    }
    
    // Trigger any necessary recalculations
    this.triggerCalculations();
  }

  populateRevenueItems(items) {
    // Clear existing items except the first required one
    const container = document.getElementById('revenueItemsContainer');
    if (container) {
      const existingItems = container.querySelectorAll('.revenue-item');
      for (let i = 1; i < existingItems.length; i++) {
        existingItems[i].remove();
      }
    }
    
    // Populate items
    items.forEach((item, index) => {
      let itemId = index + 1;
      
      if (index > 0) {
        // Add new item
        const addBtn = document.getElementById('addRevenueItem');
        if (addBtn) {
          addBtn.click();
          itemId = this.revenueItemCounter;
        }
      }
      
      // Set values
      this.setInputValue(`revenueName_${itemId}`, item.name);
      this.setInputValue(`revenueValue_${itemId}`, item.value);
      this.setInputValue(`revenueGrowthType_${itemId}`, item.growthType);
      
      if (item.growth !== undefined) {
        this.setInputValue(`linearGrowth_revenue_${itemId}`, item.growth);
      }
    });
  }

  populateOperatingExpenses(items) {
    // Clear existing items except the first required one
    const container = document.getElementById('operatingExpensesContainer');
    if (container) {
      const existingItems = container.querySelectorAll('.cost-item');
      for (let i = 1; i < existingItems.length; i++) {
        existingItems[i].remove();
      }
    }
    
    // Populate items
    items.forEach((item, index) => {
      let itemId = index + 1;
      
      if (index > 0) {
        // Add new item
        const addBtn = document.getElementById('addOperatingExpense');
        if (addBtn) {
          addBtn.click();
          itemId = this.opExCounter;
        }
      }
      
      // Set values
      this.setInputValue(`opExName_${itemId}`, item.name);
      this.setInputValue(`opExValue_${itemId}`, item.value);
      this.setInputValue(`opExGrowthType_${itemId}`, item.growthType);
      
      if (item.growth !== undefined) {
        this.setInputValue(`linearGrowth_opEx_${itemId}`, item.growth);
      }
    });
  }

  populateCapitalExpenses(items) {
    // Clear existing items except the first required one
    const container = document.getElementById('capitalExpensesContainer');
    if (container) {
      const existingItems = container.querySelectorAll('.cost-item');
      for (let i = 1; i < existingItems.length; i++) {
        existingItems[i].remove();
      }
    }
    
    // Populate items
    items.forEach((item, index) => {
      let itemId = index + 1;
      
      if (index > 0) {
        // Add new item
        const addBtn = document.getElementById('addCapitalExpense');
        if (addBtn) {
          addBtn.click();
          itemId = this.capExCounter;
        }
      }
      
      // Set values
      this.setInputValue(`capExName_${itemId}`, item.name);
      this.setInputValue(`capExValue_${itemId}`, item.value);
      this.setInputValue(`capExGrowthType_${itemId}`, item.growthType);
      
      if (item.growth !== undefined) {
        this.setInputValue(`linearGrowth_capEx_${itemId}`, item.growth);
      }
    });
  }

  setInputValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.value = value;
      // Trigger change event in case there are listeners
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  async sendChatMessage() {
    console.log('Send chat message function called');
    const input = document.getElementById('chatInput');
    console.log('Chat input element:', input);
    
    if (!input) {
      console.error('Chat input element not found');
      return;
    }
    
    const message = input.value.trim();
    console.log('Message to send:', message);
    
    if (!message) {
      console.log('No message to send (empty)');
      return;
    }
    
    // Add user message
    console.log('Adding user message to chat');
    this.addChatMessage('user', message);
    input.value = '';
    
    // Process with AI
    console.log('Processing message with AI');
    await this.processWithAI(message);
  }

  async processWithAI(message) {
    try {
      const context = await this.getExcelContext();
      
      // Process uploaded files
      const fileContents = await this.processUploadedFiles();
      
      const response = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: message,
          excelContext: context,
          fileContents: fileContents
        })
      });

      const data = await response.json();
      
      // Check if response includes commands
      if (data.commands && Array.isArray(data.commands)) {
        this.addChatMessage('assistant', data.response || 'Processing your request...');
        
        // Execute commands
        for (const command of data.commands) {
          await this.executeCommand(command);
        }
      } else {
        // Regular text response
        const responseText = data.response || data.error || 'No response received';
        this.addChatMessage('assistant', responseText);
      }
      
    } catch (error) {
      console.error('AI processing error:', error);
      
      // Try to get more specific error info
      let errorMessage = 'Sorry, I encountered an error. Please try again.';
      if (error instanceof Error) {
        errorMessage = `Error: ${error.message}`;
      }
      
      this.addChatMessage('assistant', errorMessage);
    }
  }

  async processUploadedFiles() {
    const fileContents = [];
    
    for (const file of this.uploadedFiles) {
      try {
        let content = '';
        
        if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
          content = await this.readTextFile(file);
          // Limit CSV content to first 5000 characters to stay within token limits
          content = content.substring(0, 5000);
        } else if (file.type === 'application/pdf') {
          // For PDF files, we'll send the filename and indicate it needs server-side processing
          content = `[PDF FILE: ${file.name} - ${this.formatFileSize(file.size)}]`;
        }
        
        fileContents.push(`File: ${file.name}\nContent: ${content}`);
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        fileContents.push(`File: ${file.name}\nError: Could not read file`);
      }
    }
    
    return fileContents;
  }

  readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  async executeCommand(command) {
    try {
      await Excel.run(async (context) => {
        switch (command.action) {
          case 'setValue':
            await this.setValueCommand(context, command.cell, command.value);
            break;
          case 'addToCell':
            await this.addToCellCommand(context, command.cell, command.value);
            break;
          case 'setFormula':
            await this.setFormulaCommand(context, command.cell, command.formula);
            break;
          case 'formatCell':
            await this.formatCellCommand(context, command.cell, command.format);
            break;
          case 'generateAssumptionsTemplate':
            await this.generateAssumptionsTemplate(context);
            break;
          case 'fillAssumptionsData':
            await this.fillAssumptionsData(context, command.data);
            break;
          default:
            console.warn('Unknown command action:', command.action);
        }
        
        await context.sync();
        
        if (command.action === 'generateAssumptionsTemplate') {
          this.addChatMessage('assistant', `✅ Generated M&A assumptions template`);
        } else if (command.action === 'fillAssumptionsData') {
          this.addChatMessage('assistant', `✅ Filled assumptions template with sample data`);
        } else {
          this.addChatMessage('assistant', `✅ Executed: ${command.action} on ${command.cell}`);
        }
      });
    } catch (error) {
      console.error('Command execution error:', error);
      this.addChatMessage('assistant', `❌ Error executing ${command.action}: ${error}`);
    }
  }

  async setValueCommand(context, cellAddress, value) {
    const range = context.workbook.worksheets.getActiveWorksheet().getRange(cellAddress);
    range.values = [[value]];
  }

  async setFormulaCommand(context, cellAddress, formula) {
    const range = context.workbook.worksheets.getActiveWorksheet().getRange(cellAddress);
    range.formulas = [[formula]];
  }

  async generateAssumptionsTemplate(context) {
    try {
      const worksheet = context.workbook.worksheets.getActiveWorksheet();
      
      // Step 1: Add basic content first
      const templateData = [
        ["Sample Company Ltd. - Key Assumptions", ""],
        ["Deal type", ""],
        ["Sector/Industry", ""],
        ["Geography", ""],
        ["Business Model", ""],
        ["Ownership Structure", ""],
        ["Purchase Price ($M)", ""],
        ["", ""],
        ["Acquisition Assumptions", ""],
        ["Acquisition date", ""],
        ["Holding Period (Months)", ""],
        ["Currency", ""],
        ["Transaction Fees", ""],
        ["Acquisition LTV", ""],
        ["Equity Contribution", "=B7*(1-B14)"],
        ["Debt Financing", "=B7*B14"],
        ["Debt Issuance Fees", ""],
        ["Interest Rate Margin", ""],
        ["", ""],
        ["Cost Items", ""],
        ["Staff expenses", ""],
        ["Salary Growth (p.a.)", ""],
        ["Cost Item 1", ""],
        ["Cost Item 2", ""],
        ["Cost Item 3", ""],
        ["Cost Item 4", ""],
        ["Cost Item 5", ""],
        ["Cost Item 6", ""],
        ["", ""],
        ["Exit Assumptions", ""],
        ["Disposal Costs", ""],
        ["Terminal Equity Multiple", ""],
        ["Terminal EBITDA", ""],
        ["Sale Price", ""]
      ];
      
      // Add all data at once
      worksheet.getRange("A1:B34").values = templateData;
      await context.sync();
      
      // Step 2: Apply formatting
      // Set Times New Roman font for all cells
      worksheet.getRange("A1:B34").format.font.name = "Times New Roman";
      worksheet.getRange("A1:B34").format.font.size = 12;
      
      // Title formatting - merge cells and format
      worksheet.getRange("A1:B1").merge();
      worksheet.getRange("A1").format.font.bold = true;
      worksheet.getRange("A1").format.fill.color = "#D9D9D9";
      
      // Section headers - merge cells and format
      worksheet.getRange("A9:B9").merge();
      worksheet.getRange("A9").format.fill.color = "#1F4E79";
      worksheet.getRange("A9").format.font.color = "white";
      worksheet.getRange("A9").format.font.bold = true;
      
      worksheet.getRange("A20:B20").merge();
      worksheet.getRange("A20").format.fill.color = "#1F4E79";
      worksheet.getRange("A20").format.font.color = "white";
      worksheet.getRange("A20").format.font.bold = true;
      
      worksheet.getRange("A30:B30").merge();
      worksheet.getRange("A30").format.fill.color = "#1F4E79";
      worksheet.getRange("A30").format.font.color = "white";
      worksheet.getRange("A30").format.font.bold = true;
      
      await context.sync();
      
      // Step 3: Set column widths and row heights
      worksheet.getRange("A:A").format.columnWidth = 200;
      worksheet.getRange("B:B").format.columnWidth = 150;
      
      // Set row heights for empty rows before section headers
      worksheet.getRange("8:8").format.rowHeight = 5; // Before "Acquisition Assumptions"
      worksheet.getRange("19:19").format.rowHeight = 5; // Before "Cost Items"
      worksheet.getRange("29:29").format.rowHeight = 5; // Before "Exit Assumptions"
      
      await context.sync();
      
    } catch (error) {
      console.error("Template generation error:", error);
      throw error;
    }
  }

  async fillAssumptionsData(context, data) {
    try {
      const worksheet = context.workbook.worksheets.getActiveWorksheet();
      
      // Map the data to the corresponding Excel cells
      const cellValues = [
        ["B2", data.dealType || "Business Acquisition"],
        ["B3", data.sector || "Technology"],
        ["B4", data.geography || "United States"],
        ["B5", data.businessModel || "SaaS"],
        ["B6", data.ownership || "Private Equity"],
        ["B7", data.purchasePrice || 100],
        ["B10", data.acquisitionDate || "31/03/2025"],
        ["B11", data.holdingPeriod || 60],
        ["B12", data.currency || "USD"],
        ["B13", data.transactionFees || "1.5%"],
        ["B14", data.acquisitionLTV || "75%"],
        ["B17", data.debtIssuanceFees || "1.0%"],
        ["B18", data.interestRateMargin || "3.5%"],
        ["B21", data.staffExpenses || 5000000],
        ["B22", data.salaryGrowth || "3.0%"],
        ["B23", data.costItem1 || 2000000],
        ["B24", data.costItem2 || 800000],
        ["B25", data.costItem3 || 1200000],
        ["B26", data.costItem4 || 400000],
        ["B27", data.costItem5 || 600000],
        ["B28", data.costItem6 || 300000],
        ["B31", data.disposalCosts || "0.5%"],
        ["B32", data.terminalEquityMultiple || 12.5],
        ["B33", data.terminalEBITDA || 15000000],
        ["B34", data.salePrice || 187500000]
      ];
      
      // Fill all data at once using bulk operations
      for (const [cell, value] of cellValues) {
        worksheet.getRange(cell).values = [[value]];
      }
      
      await context.sync();
      
    } catch (error) {
      console.error("Data filling error:", error);
      throw error;
    }
  }

  addChatMessage(role, content) {
    console.log(`${role.toUpperCase()}: ${content}`);
    this.chatMessages.push({ role, content });
    
    // Since we don't have a chat interface anymore, just log the message
    // This function is kept for backwards compatibility
    return;
  }

  showLoading(show) {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.style.display = show ? 'block' : 'none';
    }
  }

  showStatus(message) {
    console.log('Status:', message);
    // Could show in a status bar
  }

  initializeCollapsibleSections() {
    console.log('Initializing collapsible sections...');
    
    // Add delay to ensure DOM is fully loaded
    setTimeout(() => {
      // High-Level Parameters section collapse/expand functionality
      const minimizeHighLevelBtn = document.getElementById('minimizeHighLevel');
      const highLevelParametersSection = document.getElementById('highLevelParametersSection');
      
      // Deal Assumptions section collapse/expand functionality
      const minimizeBtn = document.getElementById('minimizeAssumptions');
      const dealAssumptionsSection = document.getElementById('dealAssumptionsSection');
      
      // Revenue Items section collapse/expand functionality
      const minimizeRevenueBtn = document.getElementById('minimizeRevenue');
      const revenueItemsSection = document.getElementById('revenueItemsSection');
      
      // Operating Expenses section collapse/expand functionality
      const minimizeOpExBtn = document.getElementById('minimizeOpEx');
      const operatingExpensesSection = document.getElementById('operatingExpensesSection');
      
      // Capital Expenses section collapse/expand functionality
      const minimizeCapExBtn = document.getElementById('minimizeCapEx');
      const capitalExpensesSection = document.getElementById('capitalExpensesSection');
      
      // Exit Assumptions section collapse/expand functionality
      const minimizeExitBtn = document.getElementById('minimizeExit');
      const exitAssumptionsSection = document.getElementById('exitAssumptionsSection');
      
      // Debt Model section collapse/expand functionality
      const minimizeDebtBtn = document.getElementById('minimizeDebtModel');
      const debtModelSection = document.getElementById('debtModelSection');
      
      console.log('DOM ready state:', document.readyState);
      console.log('Looking for elements:', {
        minimizeBtnExists: !!minimizeBtn,
        dealAssumptionsSectionExists: !!dealAssumptionsSection,
        minimizeDebtBtnExists: !!minimizeDebtBtn,
        debtModelSectionExists: !!debtModelSection,
        minimizeBtnId: minimizeBtn ? minimizeBtn.id : 'not found',
        sectionId: dealAssumptionsSection ? dealAssumptionsSection.id : 'not found'
      });
      
      // Debug: List all elements with these IDs
      console.log('All elements with minimizeAssumptions ID:', document.querySelectorAll('#minimizeAssumptions'));
      console.log('All elements with dealAssumptionsSection ID:', document.querySelectorAll('#dealAssumptionsSection'));
      
      if (minimizeBtn && dealAssumptionsSection) {
        minimizeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Deal Assumptions minimize button clicked');
          this.toggleSection(dealAssumptionsSection, minimizeBtn);
        });
        
        console.log('✅ Deal Assumptions collapsible section initialized successfully');
        
        // Add click-to-expand functionality for collapsed section
        this.addClickToExpandListener(dealAssumptionsSection, minimizeBtn);
      } else {
        console.error('❌ Could not find Deal Assumptions collapsible section elements');
      }
      
      // High-Level Parameters section event handler
      if (minimizeHighLevelBtn && highLevelParametersSection) {
        minimizeHighLevelBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('High-Level Parameters minimize button clicked');
          this.toggleSection(highLevelParametersSection, minimizeHighLevelBtn);
        });
        
        console.log('✅ High-Level Parameters collapsible section initialized successfully');
        
        // Add click-to-expand functionality for collapsed section
        this.addClickToExpandListener(highLevelParametersSection, minimizeHighLevelBtn);
      } else {
        console.error('❌ Could not find High-Level Parameters collapsible section elements');
      }
      
      // Revenue Items section event handler
      if (minimizeRevenueBtn && revenueItemsSection) {
        minimizeRevenueBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Revenue Items minimize button clicked');
          this.toggleSection(revenueItemsSection, minimizeRevenueBtn);
        });
        
        console.log('✅ Revenue Items collapsible section initialized successfully');
        
        // Add click-to-expand functionality for collapsed section
        this.addClickToExpandListener(revenueItemsSection, minimizeRevenueBtn);
      } else {
        console.error('❌ Could not find Revenue Items collapsible section elements');
      }
      
      // Operating Expenses section event handler
      if (minimizeOpExBtn && operatingExpensesSection) {
        minimizeOpExBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Operating Expenses minimize button clicked');
          this.toggleSection(operatingExpensesSection, minimizeOpExBtn);
        });
        
        console.log('✅ Operating Expenses collapsible section initialized successfully');
        
        // Add click-to-expand functionality for collapsed section
        this.addClickToExpandListener(operatingExpensesSection, minimizeOpExBtn);
      } else {
        console.error('❌ Could not find Operating Expenses collapsible section elements');
      }
      
      // Capital Expenses section event handler
      if (minimizeCapExBtn && capitalExpensesSection) {
        minimizeCapExBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Capital Expenses minimize button clicked');
          this.toggleSection(capitalExpensesSection, minimizeCapExBtn);
        });
        
        console.log('✅ Capital Expenses collapsible section initialized successfully');
        
        // Add click-to-expand functionality for collapsed section
        this.addClickToExpandListener(capitalExpensesSection, minimizeCapExBtn);
      } else {
        console.error('❌ Could not find Capital Expenses collapsible section elements');
      }
      
      // Exit Assumptions section event handler
      if (minimizeExitBtn && exitAssumptionsSection) {
        minimizeExitBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Exit Assumptions minimize button clicked');
          this.toggleSection(exitAssumptionsSection, minimizeExitBtn);
        });
        
        console.log('✅ Exit Assumptions collapsible section initialized successfully');
        
        // Add click-to-expand functionality for collapsed section
        this.addClickToExpandListener(exitAssumptionsSection, minimizeExitBtn);
      } else {
        console.error('❌ Could not find Exit Assumptions collapsible section elements');
      }
      
      // Debt Model section event handler
      if (minimizeDebtBtn && debtModelSection) {
        minimizeDebtBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Debt Model minimize button clicked');
          this.toggleSection(debtModelSection, minimizeDebtBtn);
        });
        
        console.log('✅ Debt Model collapsible section initialized successfully');
        
        // Add click-to-expand functionality for collapsed section
        this.addClickToExpandListener(debtModelSection, minimizeDebtBtn);
      } else {
        console.error('❌ Could not find Debt Model collapsible section elements');
        console.log('Available elements in DOM:', {
          totalElements: document.querySelectorAll('*').length,
          sections: document.querySelectorAll('.section').length,
          buttons: document.querySelectorAll('button').length,
          bodyHTML: document.body ? document.body.innerHTML.substring(0, 500) + '...' : 'No body'
        });
      }
    }, 500); // 500ms delay to ensure DOM is ready
  }

  addClickToExpandListener(section, minimizeBtn) {
    if (section && minimizeBtn) {
      // Add click listener to the h3 header for toggle functionality
      const sectionHeader = section.querySelector('h3');
      if (sectionHeader) {
        sectionHeader.addEventListener('click', (e) => {
          // Prevent event bubbling
          e.stopPropagation();
          
          // Don't trigger if clicking on the minimize button
          if (minimizeBtn.contains(e.target)) {
            return;
          }
          
          // Toggle the section
          this.toggleSection(section, minimizeBtn);
        });
        
        // Add visual feedback cursor
        sectionHeader.style.cursor = 'pointer';
      }
      
      // Enhanced section click listener (for when collapsed)
      section.addEventListener('click', (e) => {
        // Only expand if section is collapsed and click wasn't on the minimize button or input elements
        if (section.classList.contains('collapsed') && 
            !minimizeBtn.contains(e.target) && 
            !e.target.matches('input, select, textarea, button, a, [contenteditable]')) {
          e.preventDefault();
          this.toggleSection(section, minimizeBtn);
        }
      });
    }
  }
  
  toggleSection(section, minimizeBtn) {
    // Toggle collapsed class
    section.classList.toggle('collapsed');
    
    // Update icon and aria-label
    const isCollapsed = section.classList.contains('collapsed');
    const iconSpan = minimizeBtn.querySelector('.minimize-icon');
    if (iconSpan) {
      iconSpan.textContent = isCollapsed ? '+' : '−';
    }
    
    // Update aria-label based on section
    let sectionName = 'Section';
    if (section.id.includes('highLevel')) sectionName = 'High-Level Parameters';
    else if (section.id.includes('dealAssumptions')) sectionName = 'Deal Assumptions';
    else if (section.id.includes('revenue')) sectionName = 'Revenue Items';
    else if (section.id.includes('operatingExpenses')) sectionName = 'Operating Expenses';
    else if (section.id.includes('capitalExpenses')) sectionName = 'Capital Expenses';
    else if (section.id.includes('exit')) sectionName = 'Exit Assumptions';
    else if (section.id.includes('debt')) sectionName = 'Debt Model';
    
    minimizeBtn.setAttribute('aria-label', 
      isCollapsed ? `Expand ${sectionName}` : `Minimize ${sectionName}`
    );
    
    console.log(`${sectionName} section`, isCollapsed ? 'collapsed' : 'expanded');
  }

  initializeDebtModel() {
    console.log('Initializing debt model...');
    
    setTimeout(() => {
      const debtStatus = document.getElementById('debtStatus');
      const debtStatusMessage = document.getElementById('debtStatusMessage');
      const debtSettings = document.getElementById('debtSettings');
      const debtSchedule = document.getElementById('debtSchedule');
      const dealLTV = document.getElementById('dealLTV');
      const rateTypeFixed = document.getElementById('rateTypeFixed');
      const rateTypeFloating = document.getElementById('rateTypeFloating');
      const fixedRateGroup = document.getElementById('fixedRateGroup');
      const baseRateGroup = document.getElementById('baseRateGroup');
      const marginGroup = document.getElementById('marginGroup');
      const generateDebtScheduleBtn = document.getElementById('generateDebtSchedule');
      
      console.log('Debt model elements found:', {
        debtStatus: !!debtStatus,
        debtStatusMessage: !!debtStatusMessage,
        debtSettings: !!debtSettings,
        debtSchedule: !!debtSchedule,
        dealLTV: !!dealLTV
      });
      
      // Function to check LTV and enable/disable debt financing
      const checkDebtEligibility = () => {
        const ltvValue = parseFloat(dealLTV?.value) || 0;
        const isDebtEnabled = ltvValue > 0;
        
        if (isDebtEnabled) {
          // Enable debt financing
          if (debtStatusMessage) {
            debtStatusMessage.textContent = `Debt financing available (${ltvValue}% LTV)`;
            debtStatusMessage.className = 'status-message enabled';
          }
          if (debtSettings) debtSettings.style.display = 'block';
          if (debtSchedule) debtSchedule.style.display = 'block';
          
          // Update debt schedule
          this.updateDebtSchedule();
        } else {
          // Disable debt financing
          if (debtStatusMessage) {
            debtStatusMessage.textContent = 'Please input a higher LTV to access debt financing options';
            debtStatusMessage.className = 'status-message disabled';
          }
          if (debtSettings) debtSettings.style.display = 'none';
          if (debtSchedule) debtSchedule.style.display = 'none';
        }
        
        console.log('Debt eligibility checked:', { ltvValue, isDebtEnabled });
      };
      
      // Add event listener to Deal LTV field
      if (dealLTV) {
        dealLTV.addEventListener('input', checkDebtEligibility);
      }
      
      // Store reference for external access
      this.checkDebtEligibility = checkDebtEligibility;
      
      // Initial check
      checkDebtEligibility();
      
      // Rate type toggle
      if (rateTypeFixed && rateTypeFloating && fixedRateGroup && baseRateGroup && marginGroup) {
        const toggleRateType = () => {
          const isFixed = document.querySelector('input[name="rateType"]:checked').value === 'fixed';
          fixedRateGroup.style.display = isFixed ? 'block' : 'none';
          baseRateGroup.style.display = isFixed ? 'none' : 'block';
          marginGroup.style.display = isFixed ? 'none' : 'block';
          this.updateDebtSchedule();
        };
        
        rateTypeFixed.addEventListener('change', toggleRateType);
        rateTypeFloating.addEventListener('change', toggleRateType);
      }
      
      // Generate debt schedule button
      if (generateDebtScheduleBtn) {
        generateDebtScheduleBtn.addEventListener('click', () => {
          this.generateDebtScheduleInExcel();
        });
      }
      
      // Input change listeners to update schedule
      const inputs = ['fixedRate', 'baseRate', 'creditMargin'];
      inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
          input.addEventListener('input', () => {
            this.updateDebtSchedule();
          });
        }
      });
      
      console.log('✅ Debt model initialized successfully');
    }, 500);
  }

  updateDebtSchedule() {
    const ltvValue = parseFloat(document.getElementById('dealLTV')?.value) || 0;
    if (ltvValue <= 0) return;
    
    const rateType = document.querySelector('input[name="rateType"]:checked')?.value;
    const holdingPeriod = parseInt(document.getElementById('holdingPeriod')?.value) || 60;
    const periods = Math.ceil(holdingPeriod / 12); // Convert months to years
    
    let baseRate, allInRate;
    
    if (rateType === 'fixed') {
      const fixedRate = parseFloat(document.getElementById('fixedRate')?.value) || 5.5;
      baseRate = fixedRate;
      allInRate = fixedRate;
    } else {
      const fedRate = parseFloat(document.getElementById('baseRate')?.value) || 3.9;
      const margin = parseFloat(document.getElementById('creditMargin')?.value) || 2.0;
      baseRate = fedRate;
      allInRate = fedRate + margin; // Add user-specified margin
    }
    
    // Generate transposed sample schedule
    const previewTable = document.getElementById('debtPreviewTable');
    if (previewTable) {
      previewTable.innerHTML = '';
      
      const maxPreviewPeriods = Math.min(periods, 5);
      
      // Create header row with periods
      const headerRow = document.createElement('tr');
      headerRow.innerHTML = '<th></th>' + Array.from({length: maxPreviewPeriods}, (_, i) => `<th>Year ${i + 1}</th>`).join('');
      previewTable.appendChild(headerRow);
      
      // Base Rate row
      const baseRateRow = document.createElement('tr');
      baseRateRow.innerHTML = '<td><strong>Base Rate (%)</strong></td>' + 
        Array.from({length: maxPreviewPeriods}, () => `<td>${baseRate.toFixed(1)}</td>`).join('');
      previewTable.appendChild(baseRateRow);
      
      // All-in Rate row
      const allInRateRow = document.createElement('tr');
      allInRateRow.innerHTML = '<td><strong>All-in Rate (%)</strong></td>' + 
        Array.from({length: maxPreviewPeriods}, () => `<td>${allInRate.toFixed(1)}</td>`).join('');
      previewTable.appendChild(allInRateRow);
    }
  }

  async generateDebtScheduleInExcel() {
    console.log('Generating debt schedule in Excel...');
    
    try {
      // Check if debt financing is available based on LTV
      const ltvValue = parseFloat(document.getElementById('dealLTV')?.value) || 0;
      if (ltvValue <= 0) {
        this.addChatMessage('assistant', '⚠️ Please input a Deal LTV greater than 0% to generate a debt schedule.');
        return;
      }
      
      console.log('Excel API available:', typeof Excel !== 'undefined');
      console.log('Office API available:', typeof Office !== 'undefined');
      
      const rateType = document.querySelector('input[name="rateType"]:checked')?.value;
      const holdingPeriod = parseInt(document.getElementById('holdingPeriod')?.value) || 60;
      const dealValue = parseFloat(document.getElementById('dealValue')?.value) || 100000000;
      const ltv = parseFloat(document.getElementById('dealLTV')?.value) || 70;
      
      let baseRate, allInRate;
      
      if (rateType === 'fixed') {
        const fixedRate = parseFloat(document.getElementById('fixedRate')?.value) || 5.5;
        baseRate = fixedRate;
        allInRate = fixedRate;
      } else {
        const fedRate = parseFloat(document.getElementById('baseRate')?.value) || 3.9;
        const margin = parseFloat(document.getElementById('creditMargin')?.value) || 2.0;
        baseRate = fedRate;
        allInRate = fedRate + margin;
      }
      
      const debtAmount = dealValue * (ltv / 100);
      const periods = Math.ceil(holdingPeriod / 12);
      
      // Show loading state
      this.addChatMessage('assistant', '🔄 Generating debt schedule in Excel...');
      
      // Try to create Excel schedule
      if (typeof Excel !== 'undefined' && typeof Office !== 'undefined') {
        console.log('Starting Excel.run...');
        await Excel.run(async (context) => {
          console.log('Inside Excel.run context');
          
          try {
            // Create a new worksheet for the debt schedule
            console.log('Creating new worksheet for debt schedule...');
            
            // Check if "Debt Schedule" worksheet already exists and delete it
            let debtScheduleWorksheet;
            try {
              debtScheduleWorksheet = context.workbook.worksheets.getItem('Debt Schedule');
              debtScheduleWorksheet.delete();
              await context.sync();
              console.log('Deleted existing Debt Schedule worksheet');
            } catch (e) {
              console.log('No existing Debt Schedule worksheet to delete');
            }
            
            // Create new worksheet
            debtScheduleWorksheet = context.workbook.worksheets.add('Debt Schedule');
            await context.sync();
            console.log('Created new Debt Schedule worksheet');
            
            // Activate the new worksheet
            debtScheduleWorksheet.activate();
            await context.sync();
            console.log('Activated new worksheet successfully');
            
            // Get all deal parameters from form
            const dealName = document.getElementById('dealName')?.value || 'M&A Deal';
            console.log('Got deal parameters:', { dealName, dealValue, debtAmount, allInRate });
            
            // Create simple debt schedule data
            console.log('Creating simplified debt schedule data...');
            
            // Step 1: Insert basic data first (no complex calculations)
            const basicData = [
              ['Debt Model', '', '', '', '', '', '', '', '', ''],
              ['', '', '', '', '', '', '', '', '', ''],
              ['Period', '1-Jan-25', '2-Feb-25', '3-Mar-25', '4-Apr-25', '5-May-25', '6-Jun-25', '7-Jul-25', '8-Aug-25', '9-Sep-25'],
              ['Base interest rate - U.S. Fed', `${baseRate.toFixed(1)}%`, `${baseRate.toFixed(1)}%`, `${baseRate.toFixed(1)}%`, `${baseRate.toFixed(1)}%`, `${baseRate.toFixed(1)}%`, `${baseRate.toFixed(1)}%`, `${baseRate.toFixed(1)}%`, `${baseRate.toFixed(1)}%`, `${baseRate.toFixed(1)}%`],
              ['All-in interest rate', `${allInRate.toFixed(1)}%`, `${allInRate.toFixed(1)}%`, `${allInRate.toFixed(1)}%`, `${allInRate.toFixed(1)}%`, `${allInRate.toFixed(1)}%`, `${allInRate.toFixed(1)}%`, `${allInRate.toFixed(1)}%`, `${allInRate.toFixed(1)}%`, `${allInRate.toFixed(1)}%`]
            ];
            
            // Use fixed range to avoid calculation errors
            const dataRange = debtScheduleWorksheet.getRange('A1:J5');
            dataRange.values = basicData;
            console.log('Basic data inserted to A1:J5');
            
            await context.sync();
            console.log('Data sync completed');
            
            // Step 2: Apply professional formatting with Times New Roman
            try {
              // Apply Times New Roman 12pt to entire debt schedule area
              const entireRange = debtScheduleWorksheet.getRange('A1:J5');
              entireRange.format.font.name = 'Times New Roman';
              entireRange.format.font.size = 12;
              
              // Format header
              const headerRange = debtScheduleWorksheet.getRange('A1:J1');
              headerRange.format.font.bold = true;
              headerRange.format.fill.color = '#D9D9D9';
              headerRange.merge();
              
              // Format period headers with dark teal background and white text
              const periodHeaderRange = debtScheduleWorksheet.getRange('A3:J3');
              periodHeaderRange.format.font.bold = true;
              periodHeaderRange.format.fill.color = '#1F5F5B'; // Dark teal, accent 1, darker 25%
              periodHeaderRange.format.font.color = '#FFFFFF'; // White text
              
              // Format labels column
              const labelRange = debtScheduleWorksheet.getRange('A1:A5');
              labelRange.format.font.bold = true;
              
              // Add borders for professional appearance
              const tableRange = debtScheduleWorksheet.getRange('A1:J5');
              tableRange.format.borders.getItem('InsideHorizontal').style = 'Continuous';
              tableRange.format.borders.getItem('InsideVertical').style = 'Continuous';
              tableRange.format.borders.getItem('EdgeBottom').style = 'Continuous';
              tableRange.format.borders.getItem('EdgeLeft').style = 'Continuous';
              tableRange.format.borders.getItem('EdgeRight').style = 'Continuous';
              tableRange.format.borders.getItem('EdgeTop').style = 'Continuous';
              
              await context.sync();
              console.log('Professional formatting applied with Times New Roman 12pt');
            } catch (formatError) {
              console.log('Formatting failed but data was inserted:', formatError);
            }
          
            await context.sync();
            console.log('Excel data synced successfully');
            
            this.addChatMessage('assistant', `✅ Debt schedule created in new "Debt Schedule" worksheet! Deal: ${dealName} | Debt: $${debtAmount.toFixed(1)}M | All-in Rate: ${allInRate.toFixed(1)}%`);
            
          } catch (innerError) {
            console.error('Error inside Excel.run:', innerError);
            this.addChatMessage('assistant', `❌ Error creating Excel worksheet: ${innerError.message}. Please try again.`);
          }
        }).catch(excelError => {
          console.error('Excel.run failed:', excelError);
          this.addChatMessage('assistant', `❌ Excel API error: ${excelError.message}. Please ensure you're using Excel Online or Excel desktop with Office.js support.`);
        });
      } else {
        console.log('Excel API not available, using fallback');
        
        // Try simple Excel approach without complex formatting
        if (typeof Office !== 'undefined' && Office.context && Office.context.document) {
          this.addChatMessage('assistant', '🔄 Excel API limited - trying simple table creation...');
          
          try {
            await Excel.run(async (context) => {
              const worksheet = context.workbook.worksheets.getActiveWorksheet();
              
              // Create simple table
              const range = worksheet.getRange('A1:F10');
              range.values = [
                ['DEBT SCHEDULE', '', '', '', '', ''],
                ['Deal Name', document.getElementById('dealName')?.value || 'M&A Deal', '', '', '', ''],
                ['Deal Value', (dealValue / 1000000).toFixed(1) + 'M', '', '', '', ''],
                ['Debt Amount ($M)', debtAmount.toFixed(1), '', '', '', ''],
                ['All-in Rate (%)', allInRate.toFixed(1), '', '', '', ''],
                ['', '', '', '', '', ''],
                ['', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'],
                ['Base Rate (%)', baseRate.toFixed(1), baseRate.toFixed(1), baseRate.toFixed(1), baseRate.toFixed(1), baseRate.toFixed(1)],
                ['All-in Rate (%)', allInRate.toFixed(1), allInRate.toFixed(1), allInRate.toFixed(1), allInRate.toFixed(1), allInRate.toFixed(1)]
              ];
              
              await context.sync();
              this.addChatMessage('assistant', '✅ Basic debt schedule created in current worksheet!');
            });
          } catch (simpleError) {
            console.error('Simple Excel creation failed:', simpleError);
            // Ultimate fallback
            this.addChatMessage('assistant', `📊 Debt Schedule Summary:\n• Deal: ${document.getElementById('dealName')?.value || 'M&A Deal'}\n• Debt Amount: $${debtAmount.toFixed(1)}M (${ltv}% LTV)\n• Rate Type: ${rateType === 'fixed' ? 'Fixed' : 'Floating'}\n• All-in Rate: ${allInRate.toFixed(1)}%\n• Term: ${periods} years\n\nExcel API not fully available. Please copy this data into Excel manually.`);
          }
        } else {
          // Ultimate fallback
          this.addChatMessage('assistant', `📊 Debt Schedule Summary:\n• Deal: ${document.getElementById('dealName')?.value || 'M&A Deal'}\n• Debt Amount: $${debtAmount.toFixed(1)}M (${ltv}% LTV)\n• Rate Type: ${rateType === 'fixed' ? 'Fixed' : 'Floating'}\n• All-in Rate: ${allInRate.toFixed(1)}%\n• Term: ${periods} years\n\nExcel API not available. Please copy this data into Excel manually.`);
        }
      }
      
    } catch (error) {
      console.error('Error generating debt schedule:', error);
      this.addChatMessage('assistant', '❌ Error generating debt schedule. Please check your inputs and try again.');
    }
  }

  initializeHighLevelParameters() {
    console.log('Initializing high-level parameters...');
    
    setTimeout(() => {
      const projectStartDate = document.getElementById('projectStartDate');
      const projectEndDate = document.getElementById('projectEndDate');
      const modelPeriods = document.getElementById('modelPeriods');
      const holdingPeriodsCalculated = document.getElementById('holdingPeriodsCalculated');
      
      console.log('High-level parameters elements found:', {
        projectStartDate: !!projectStartDate,
        projectEndDate: !!projectEndDate,
        modelPeriods: !!modelPeriods,
        holdingPeriodsCalculated: !!holdingPeriodsCalculated
      });
      
      // Set default start date to today
      if (projectStartDate) {
        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0];
        projectStartDate.value = formattedDate;
      }
      
      // Function to calculate holding periods
      const calculateHoldingPeriods = () => {
        if (!projectStartDate?.value || !projectEndDate?.value || !modelPeriods?.value) {
          if (holdingPeriodsCalculated) {
            holdingPeriodsCalculated.value = '';
          }
          return;
        }
        
        const startDate = new Date(projectStartDate.value);
        const endDate = new Date(projectEndDate.value);
        const periodType = modelPeriods.value;
        
        if (endDate <= startDate) {
          if (holdingPeriodsCalculated) {
            holdingPeriodsCalculated.value = 'End date must be after start date';
          }
          return;
        }
        
        let periods = 0;
        
        switch (periodType) {
          case 'daily':
            const diffTime = Math.abs(endDate - startDate);
            periods = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            break;
            
          case 'monthly':
            periods = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                     (endDate.getMonth() - startDate.getMonth());
            if (endDate.getDate() >= startDate.getDate()) periods++;
            break;
            
          case 'quarterly':
            const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                              (endDate.getMonth() - startDate.getMonth());
            periods = Math.ceil(monthsDiff / 3);
            break;
            
          case 'yearly':
            periods = endDate.getFullYear() - startDate.getFullYear();
            if (endDate.getMonth() > startDate.getMonth() || 
                (endDate.getMonth() === startDate.getMonth() && endDate.getDate() >= startDate.getDate())) {
              periods++;
            }
            break;
        }
        
        if (holdingPeriodsCalculated) {
          holdingPeriodsCalculated.value = `${periods} ${periodType === 'daily' ? 'days' : periodType.slice(0, -2) + 's'}`;
        }
        
        console.log('Calculated holding periods:', periods, periodType);
      };
      
      // Add event listeners for automatic calculation
      if (projectStartDate) {
        projectStartDate.addEventListener('change', calculateHoldingPeriods);
      }
      if (projectEndDate) {
        projectEndDate.addEventListener('change', calculateHoldingPeriods);
      }
      if (modelPeriods) {
        modelPeriods.addEventListener('change', calculateHoldingPeriods);
      }
      
      // Initial calculation
      calculateHoldingPeriods();
      
      console.log('✅ High-level parameters initialized successfully');
    }, 500);
  }

  initializeDealAssumptions() {
    console.log('Initializing deal assumptions calculations...');
    
    setTimeout(() => {
      const dealValue = document.getElementById('dealValue');
      const dealLTV = document.getElementById('dealLTV');
      const equityContribution = document.getElementById('equityContribution');
      const debtFinancing = document.getElementById('debtFinancing');
      const currency = document.getElementById('currency');
      
      console.log('Deal assumptions elements found:', {
        dealValue: !!dealValue,
        dealLTV: !!dealLTV,
        equityContribution: !!equityContribution,
        debtFinancing: !!debtFinancing,
        currency: !!currency
      });
      
      // Function to format currency values
      const formatCurrency = (amount, currencyCode = 'USD') => {
        if (isNaN(amount) || amount === 0) return '';
        
        const formatter = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currencyCode,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        });
        
        return formatter.format(amount);
      };
      
      // Function to calculate deal assumptions
      const calculateDealAssumptions = () => {
        const dealValueAmount = parseFloat(dealValue?.value) || 0;
        const ltvPercentage = parseFloat(dealLTV?.value) || 0;
        const selectedCurrency = currency?.value || 'USD';
        
        if (dealValueAmount <= 0 || ltvPercentage <= 0) {
          if (equityContribution) equityContribution.value = '';
          if (debtFinancing) debtFinancing.value = '';
          return;
        }
        
        // Calculate equity contribution (Deal Value × (100% - LTV%))
        const equityAmount = dealValueAmount * (100 - ltvPercentage) / 100;
        
        // Calculate debt financing (Deal Value × LTV%)
        const debtAmount = dealValueAmount * ltvPercentage / 100;
        
        // Update calculated fields with currency formatting
        if (equityContribution) {
          equityContribution.value = formatCurrency(equityAmount, selectedCurrency);
        }
        
        if (debtFinancing) {
          debtFinancing.value = formatCurrency(debtAmount, selectedCurrency);
        }
        
        console.log('Calculated deal assumptions:', {
          dealValue: dealValueAmount,
          ltv: ltvPercentage,
          equity: equityAmount,
          debt: debtAmount,
          currency: selectedCurrency
        });
        
        // Trigger debt model check when LTV changes
        if (window.maModelingAddin && window.maModelingAddin.checkDebtEligibility) {
          window.maModelingAddin.checkDebtEligibility();
        }
      };
      
      // Add event listeners for automatic calculation
      if (dealValue) {
        dealValue.addEventListener('input', calculateDealAssumptions);
      }
      if (dealLTV) {
        dealLTV.addEventListener('input', calculateDealAssumptions);
      }
      if (currency) {
        currency.addEventListener('change', calculateDealAssumptions);
      }
      
      // Initial calculation
      calculateDealAssumptions();
      
      console.log('✅ Deal assumptions calculations initialized successfully');
    }, 500);
  }

  initializeRevenueItems() {
    console.log('Initializing revenue items...');
    
    setTimeout(() => {
      const revenueItemsContainer = document.getElementById('revenueItemsContainer');
      const addRevenueItemBtn = document.getElementById('addRevenueItem');
      
      console.log('Revenue items elements found:', {
        revenueItemsContainer: !!revenueItemsContainer,
        addRevenueItemBtn: !!addRevenueItemBtn
      });
      
      this.revenueItemCounter = 0;
      
      // Function to create a new revenue item
      const createRevenueItem = (isRequired = false) => {
        this.revenueItemCounter++;
        const itemId = this.revenueItemCounter;
        
        const revenueItem = document.createElement('div');
        revenueItem.className = 'revenue-item';
        revenueItem.setAttribute('data-revenue-id', itemId);
        
        revenueItem.innerHTML = `
          <div class="revenue-item-header">
            <div class="revenue-item-title">Revenue Item ${itemId}${isRequired ? ' (Required)' : ''}</div>
            ${!isRequired ? `<button class="remove-revenue-item" data-revenue-id="${itemId}">Remove</button>` : ''}
          </div>
          
          <div class="revenue-item-fields">
            <div class="form-group">
              <label>Revenue Source Name</label>
              <input type="text" id="revenueName_${itemId}" placeholder="e.g., Product Sales, Subscriptions"/>
              <small class="help-text">Name or description of this revenue stream</small>
            </div>
            
            <div class="form-group">
              <label>Initial Value</label>
              <input type="number" id="revenueValue_${itemId}" placeholder="e.g., 10000000" step="100000"/>
              <small class="help-text">Starting revenue amount in selected currency</small>
            </div>
          </div>
          
          <div class="revenue-growth-config">
            <div class="form-group">
              <label>Growth Type</label>
              <select id="growthType_${itemId}">
                <option value="none">No Growth</option>
                <option value="linear" selected>Linear Growth</option>
                <option value="nonlinear">Non-Linear Growth</option>
              </select>
              <small class="help-text">Select how this revenue stream grows over time</small>
            </div>
            
            <div class="growth-inputs" id="growthInputs_${itemId}">
              <!-- Growth-specific inputs will be inserted here -->
            </div>
          </div>
        `;
        
        if (revenueItemsContainer) {
          revenueItemsContainer.appendChild(revenueItem);
        }
        
        // Set up event listeners for this item
        this.setupRevenueItemListeners(itemId);
        
        // Initialize with linear growth by default
        this.updateGrowthInputs(itemId, 'linear');
        
        console.log('Created revenue item:', itemId);
        return itemId;
      };
      
      // Function to remove a revenue item
      const removeRevenueItem = (itemId) => {
        const revenueItem = document.querySelector(`[data-revenue-id="${itemId}"]`);
        if (revenueItem) {
          revenueItem.remove();
          console.log('Removed revenue item:', itemId);
        }
      };
      
      // Add revenue item button event listener
      if (addRevenueItemBtn) {
        addRevenueItemBtn.addEventListener('click', () => {
          createRevenueItem(false);
        });
      }
      
      // Set up event delegation for remove buttons
      if (revenueItemsContainer) {
        revenueItemsContainer.addEventListener('click', (e) => {
          if (e.target.classList.contains('remove-revenue-item')) {
            const itemId = e.target.getAttribute('data-revenue-id');
            removeRevenueItem(itemId);
          }
        });
      }
      
      // Create the first required revenue item
      createRevenueItem(true);
      
      console.log('✅ Revenue items initialized successfully');
    }, 500);
  }

  setupRevenueItemListeners(itemId) {
    const growthTypeSelect = document.getElementById(`growthType_${itemId}`);
    
    if (growthTypeSelect) {
      growthTypeSelect.addEventListener('change', (e) => {
        this.updateGrowthInputs(itemId, e.target.value);
      });
    }
  }

  updateGrowthInputs(itemId, growthType) {
    const growthInputsContainer = document.getElementById(`growthInputs_${itemId}`);
    if (!growthInputsContainer) return;
    
    growthInputsContainer.innerHTML = '';
    
    switch (growthType) {
      case 'none':
        growthInputsContainer.innerHTML = `
          <div class="form-group">
            <small class="help-text">This revenue stream will remain constant over time</small>
          </div>
        `;
        break;
        
      case 'linear':
        growthInputsContainer.innerHTML = `
          <div class="form-group">
            <label>Annual Growth Rate (%)</label>
            <input type="number" id="linearGrowth_${itemId}" placeholder="e.g., 15" step="0.1" value="0"/>
            <small class="help-text">Positive for growth, negative for decline (e.g., 15% or -5%)</small>
          </div>
        `;
        break;
        
      case 'nonlinear':
        const projectStartDate = document.getElementById('projectStartDate')?.value;
        const projectEndDate = document.getElementById('projectEndDate')?.value;
        const modelPeriods = document.getElementById('modelPeriods')?.value;
        const holdingPeriodsCalculated = document.getElementById('holdingPeriodsCalculated')?.value;
        
        // Extract number of periods from calculated holding periods
        let totalPeriods = 12; // default fallback
        if (holdingPeriodsCalculated) {
          const periodsMatch = holdingPeriodsCalculated.match(/(\d+)/);
          if (periodsMatch) {
            totalPeriods = parseInt(periodsMatch[1]);
          }
        }
        
        console.log('Non-linear setup:', { modelPeriods, totalPeriods, holdingPeriodsCalculated });
        
        if (totalPeriods <= 12) {
          // Simple period-by-period input for ≤12 periods
          const periodInputs = [];
          const periodLabel = this.getPeriodLabel(modelPeriods);
          
          for (let i = 1; i <= totalPeriods; i++) {
            periodInputs.push(`
              <div class="year-input-group">
                <label>${periodLabel} ${i}</label>
                <input type="number" id="nonLinearGrowth_${itemId}_${i}" placeholder="%" step="0.1" value="0"/>
              </div>
            `);
          }
          
          growthInputsContainer.innerHTML = `
            <div class="form-group">
              <label>Period-by-Period Growth Rates (%)</label>
              <div class="non-linear-inputs">
                ${periodInputs.join('')}
              </div>
              <small class="help-text">Set specific growth rate for each ${periodLabel.toLowerCase()}. Positive for growth, negative for decline.</small>
            </div>
          `;
        } else {
          // Grouped input for >12 periods
          growthInputsContainer.innerHTML = `
            <div class="form-group">
              <label>Grouped Growth Periods</label>
              <div class="period-groups" id="periodGroups_${itemId}">
                <div class="period-group">
                  <div class="period-group-header">
                    <label>Group 1</label>
                    <button type="button" class="add-period-group" data-item-id="${itemId}">+ Add Group</button>
                  </div>
                  <div class="period-group-inputs">
                    <div class="form-group">
                      <label>From ${this.getPeriodLabel(modelPeriods)}</label>
                      <input type="number" id="periodStart_${itemId}_1" placeholder="1" min="1" max="${totalPeriods}" value="1"/>
                    </div>
                    <div class="form-group">
                      <label>To ${this.getPeriodLabel(modelPeriods)}</label>
                      <input type="number" id="periodEnd_${itemId}_1" placeholder="12" min="1" max="${totalPeriods}" value="12"/>
                    </div>
                    <div class="form-group">
                      <label>Growth Rate (%)</label>
                      <input type="number" id="periodGrowth_${itemId}_1" placeholder="0" step="0.1" value="0"/>
                    </div>
                  </div>
                </div>
              </div>
              <small class="help-text">Define growth rates for period ranges. Example: ${this.getPeriodLabel(modelPeriods)}s 1-12 at 1%, then ${this.getPeriodLabel(modelPeriods)}s 13-${totalPeriods} at 0.5%</small>
            </div>
          `;
          
          // Add event listener for adding more period groups
          setTimeout(() => {
            const addGroupBtn = document.querySelector(`[data-item-id="${itemId}"]`);
            if (addGroupBtn) {
              addGroupBtn.addEventListener('click', () => this.addPeriodGroup(itemId, totalPeriods, modelPeriods));
            }
          }, 100);
        }
        break;
    }
    
    console.log('Updated growth inputs for item', itemId, 'with type', growthType);
  }

  getPeriodLabel(modelPeriods) {
    switch (modelPeriods) {
      case 'daily': return 'Day';
      case 'monthly': return 'Month';
      case 'quarterly': return 'Quarter';
      case 'yearly': return 'Year';
      default: return 'Period';
    }
  }

  addPeriodGroup(itemId, totalPeriods, modelPeriods) {
    const periodGroupsContainer = document.getElementById(`periodGroups_${itemId}`);
    if (!periodGroupsContainer) return;
    
    const existingGroups = periodGroupsContainer.querySelectorAll('.period-group');
    const groupNumber = existingGroups.length + 1;
    
    // Calculate suggested start period (end of last group + 1)
    const lastGroup = existingGroups[existingGroups.length - 1];
    const lastEndInput = lastGroup.querySelector('[id*="periodEnd_"]');
    const suggestedStart = lastEndInput ? parseInt(lastEndInput.value) + 1 : 1;
    const suggestedEnd = Math.min(suggestedStart + 11, totalPeriods);
    
    const periodLabel = this.getPeriodLabel(modelPeriods);
    
    const newGroup = document.createElement('div');
    newGroup.className = 'period-group';
    newGroup.innerHTML = `
      <div class="period-group-header">
        <label>Group ${groupNumber}</label>
        <button type="button" class="remove-period-group">× Remove</button>
      </div>
      <div class="period-group-inputs">
        <div class="form-group">
          <label>From ${periodLabel}</label>
          <input type="number" id="periodStart_${itemId}_${groupNumber}" placeholder="${suggestedStart}" min="1" max="${totalPeriods}" value="${suggestedStart}"/>
        </div>
        <div class="form-group">
          <label>To ${periodLabel}</label>
          <input type="number" id="periodEnd_${itemId}_${groupNumber}" placeholder="${suggestedEnd}" min="1" max="${totalPeriods}" value="${suggestedEnd}"/>
        </div>
        <div class="form-group">
          <label>Growth Rate (%)</label>
          <input type="number" id="periodGrowth_${itemId}_${groupNumber}" placeholder="0" step="0.1" value="0"/>
        </div>
      </div>
    `;
    
    // Remove the add button from previous groups
    periodGroupsContainer.querySelectorAll('.add-period-group').forEach(btn => btn.remove());
    
    // Add the new group
    periodGroupsContainer.appendChild(newGroup);
    
    // Add the "Add Group" button to the new group if not at total periods
    if (suggestedEnd < totalPeriods) {
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'add-period-group';
      addButton.setAttribute('data-item-id', itemId);
      addButton.textContent = '+ Add Group';
      newGroup.querySelector('.period-group-header').appendChild(addButton);
      
      addButton.addEventListener('click', () => this.addPeriodGroup(itemId, totalPeriods, modelPeriods));
    }
    
    // Add remove functionality
    const removeBtn = newGroup.querySelector('.remove-period-group');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        newGroup.remove();
        // Re-add the add button to the last group if needed
        const remainingGroups = periodGroupsContainer.querySelectorAll('.period-group');
        const lastRemainingGroup = remainingGroups[remainingGroups.length - 1];
        if (lastRemainingGroup && !lastRemainingGroup.querySelector('.add-period-group')) {
          const lastEndInput = lastRemainingGroup.querySelector('[id*="periodEnd_"]');
          const lastEnd = lastEndInput ? parseInt(lastEndInput.value) : 0;
          if (lastEnd < totalPeriods) {
            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.className = 'add-period-group';
            addButton.setAttribute('data-item-id', itemId);
            addButton.textContent = '+ Add Group';
            lastRemainingGroup.querySelector('.period-group-header').appendChild(addButton);
            
            addButton.addEventListener('click', () => this.addPeriodGroup(itemId, totalPeriods, modelPeriods));
          }
        }
      });
    }
    
    console.log('Added period group', groupNumber, 'for item', itemId);
  }

  initializeCostItems() {
    console.log('Initializing cost items...');
    this.initializeOperatingExpenses();
    this.initializeCapitalExpenses();
  }

  initializeOperatingExpenses() {
    console.log('Initializing operating expenses...');
    
    setTimeout(() => {
      const operatingExpensesContainer = document.getElementById('operatingExpensesContainer');
      const addOperatingExpenseBtn = document.getElementById('addOperatingExpense');
      
      console.log('Operating expenses elements found:', {
        operatingExpensesContainer: !!operatingExpensesContainer,
        addOperatingExpenseBtn: !!addOperatingExpenseBtn
      });
      
      this.opExCounter = 0;
      
      // Function to create a new operating expense item
      const createOperatingExpense = (isRequired = false) => {
        this.opExCounter++;
        const itemId = this.opExCounter;
        
        const opExItem = document.createElement('div');
        opExItem.className = 'cost-item';
        opExItem.setAttribute('data-cost-id', itemId);
        
        opExItem.innerHTML = `
          <div class="cost-item-header">
            <div class="cost-item-title">Operating Expense ${itemId}${isRequired ? ' (Required)' : ''}</div>
            ${!isRequired ? `<button class="remove-cost-item" data-cost-id="${itemId}">Remove</button>` : ''}
          </div>
          
          <div class="cost-item-fields">
            <div class="form-group">
              <label>Operating Expense Name</label>
              <input type="text" id="opExName_${itemId}" placeholder="e.g., Staff Expenses, Marketing Costs"/>
              <small class="help-text">Name or description of this operating expense</small>
            </div>
            
            <div class="form-group">
              <label>Initial Value</label>
              <input type="number" id="opExValue_${itemId}" placeholder="e.g., 5000000" step="100000"/>
              <small class="help-text">Starting expense amount in selected currency</small>
            </div>
          </div>
          
          <div class="cost-growth-config">
            <div class="form-group">
              <label>Growth Type</label>
              <select id="opExGrowthType_${itemId}">
                <option value="none">No Growth</option>
                <option value="linear" selected>Linear Growth</option>
                <option value="nonlinear">Non-Linear Growth</option>
              </select>
              <small class="help-text">Select how this expense grows over time</small>
            </div>
            
            <div class="growth-inputs" id="opExGrowthInputs_${itemId}">
              <!-- Growth-specific inputs will be inserted here -->
            </div>
          </div>
        `;
        
        if (operatingExpensesContainer) {
          operatingExpensesContainer.appendChild(opExItem);
        }
        
        // Set up event listeners for this item
        this.setupOpExListeners(itemId);
        
        // Initialize with linear growth by default
        this.updateOpExGrowthInputs(itemId, 'linear');
        
        console.log('Created operating expense:', itemId);
        return itemId;
      };
      
      // Function to remove an operating expense
      const removeOperatingExpense = (itemId) => {
        const opExItem = operatingExpensesContainer.querySelector(`[data-cost-id="${itemId}"]`);
        if (opExItem) {
          opExItem.remove();
          console.log('Removed operating expense:', itemId);
        }
      };
      
      // Add operating expense button event listener
      if (addOperatingExpenseBtn) {
        addOperatingExpenseBtn.addEventListener('click', () => {
          createOperatingExpense(false);
        });
      }
      
      // Set up event delegation for remove buttons
      if (operatingExpensesContainer) {
        operatingExpensesContainer.addEventListener('click', (e) => {
          if (e.target.classList.contains('remove-cost-item')) {
            const itemId = e.target.getAttribute('data-cost-id');
            removeOperatingExpense(itemId);
          }
        });
      }
      
      // Create the first required operating expense
      createOperatingExpense(true);
      
      console.log('✅ Operating expenses initialized successfully');
    }, 500);
  }

  initializeCapitalExpenses() {
    console.log('Initializing capital expenses...');
    
    setTimeout(() => {
      const capitalExpensesContainer = document.getElementById('capitalExpensesContainer');
      const addCapitalExpenseBtn = document.getElementById('addCapitalExpense');
      
      console.log('Capital expenses elements found:', {
        capitalExpensesContainer: !!capitalExpensesContainer,
        addCapitalExpenseBtn: !!addCapitalExpenseBtn
      });
      
      this.capExCounter = 0;
      
      // Function to create a new capital expense item
      const createCapitalExpense = (isRequired = false) => {
        this.capExCounter++;
        const itemId = this.capExCounter;
        
        const capExItem = document.createElement('div');
        capExItem.className = 'cost-item';
        capExItem.setAttribute('data-cost-id', itemId);
        
        capExItem.innerHTML = `
          <div class="cost-item-header">
            <div class="cost-item-title">Capital Expense ${itemId}${isRequired ? ' (Required)' : ''}</div>
            ${!isRequired ? `<button class="remove-cost-item" data-cost-id="${itemId}">Remove</button>` : ''}
          </div>
          
          <div class="cost-item-fields">
            <div class="form-group">
              <label>Capital Expense Name</label>
              <input type="text" id="capExName_${itemId}" placeholder="e.g., Equipment, Building Improvements"/>
              <small class="help-text">Name or description of this capital expense</small>
            </div>
            
            <div class="form-group">
              <label>Initial Value</label>
              <input type="number" id="capExValue_${itemId}" placeholder="e.g., 1000000" step="100000"/>
              <small class="help-text">Starting capital expense amount in selected currency</small>
            </div>
          </div>
          
          <div class="cost-growth-config">
            <div class="form-group">
              <label>Growth Type</label>
              <select id="capExGrowthType_${itemId}">
                <option value="none">No Growth</option>
                <option value="linear" selected>Linear Growth</option>
                <option value="nonlinear">Non-Linear Growth</option>
              </select>
              <small class="help-text">Select how this capital expense grows over time</small>
            </div>
            
            <div class="growth-inputs" id="capExGrowthInputs_${itemId}">
              <!-- Growth-specific inputs will be inserted here -->
            </div>
          </div>
        `;
        
        if (capitalExpensesContainer) {
          capitalExpensesContainer.appendChild(capExItem);
        }
        
        // Set up event listeners for this item
        this.setupCapExListeners(itemId);
        
        // Initialize with linear growth by default
        this.updateCapExGrowthInputs(itemId, 'linear');
        
        console.log('Created capital expense:', itemId);
        return itemId;
      };
      
      // Function to remove a capital expense
      const removeCapitalExpense = (itemId) => {
        const capExItem = capitalExpensesContainer.querySelector(`[data-cost-id="${itemId}"]`);
        if (capExItem) {
          capExItem.remove();
          console.log('Removed capital expense:', itemId);
        }
      };
      
      // Add capital expense button event listener
      if (addCapitalExpenseBtn) {
        addCapitalExpenseBtn.addEventListener('click', () => {
          createCapitalExpense(false);
        });
      }
      
      // Set up event delegation for remove buttons
      if (capitalExpensesContainer) {
        capitalExpensesContainer.addEventListener('click', (e) => {
          if (e.target.classList.contains('remove-cost-item')) {
            const itemId = e.target.getAttribute('data-cost-id');
            removeCapitalExpense(itemId);
          }
        });
      }
      
      // Create the first required capital expense
      createCapitalExpense(true);
      
      console.log('✅ Capital expenses initialized successfully');
    }, 600);
  }

  setupOpExListeners(itemId) {
    const opExGrowthTypeSelect = document.getElementById(`opExGrowthType_${itemId}`);
    
    if (opExGrowthTypeSelect) {
      opExGrowthTypeSelect.addEventListener('change', (e) => {
        this.updateOpExGrowthInputs(itemId, e.target.value);
      });
    }
  }

  setupCapExListeners(itemId) {
    const capExGrowthTypeSelect = document.getElementById(`capExGrowthType_${itemId}`);
    
    if (capExGrowthTypeSelect) {
      capExGrowthTypeSelect.addEventListener('change', (e) => {
        this.updateCapExGrowthInputs(itemId, e.target.value);
      });
    }
  }

  setupCostItemListeners(itemId) {
    const costGrowthTypeSelect = document.getElementById(`costGrowthType_${itemId}`);
    
    if (costGrowthTypeSelect) {
      costGrowthTypeSelect.addEventListener('change', (e) => {
        this.updateCostGrowthInputs(itemId, e.target.value);
      });
    }
  }

  updateCostGrowthInputs(itemId, growthType) {
    const growthInputsContainer = document.getElementById(`costGrowthInputs_${itemId}`);
    if (!growthInputsContainer) return;
    
    growthInputsContainer.innerHTML = '';
    
    switch (growthType) {
      case 'none':
        growthInputsContainer.innerHTML = `
          <div class="form-group">
            <small class="help-text">This cost category will remain constant over time</small>
          </div>
        `;
        break;
        
      case 'linear':
        growthInputsContainer.innerHTML = `
          <div class="form-group">
            <label>Annual Growth Rate (%)</label>
            <input type="number" id="costLinearGrowth_${itemId}" placeholder="e.g., 3" step="0.1" value="0"/>
            <small class="help-text">Positive for cost increase, negative for cost reduction (e.g., 3% or -2%)</small>
          </div>
        `;
        break;
        
      case 'nonlinear':
        const projectStartDate = document.getElementById('projectStartDate')?.value;
        const projectEndDate = document.getElementById('projectEndDate')?.value;
        const modelPeriods = document.getElementById('modelPeriods')?.value;
        const holdingPeriodsCalculated = document.getElementById('holdingPeriodsCalculated')?.value;
        
        // Extract number of periods from calculated holding periods
        let totalPeriods = 12; // default fallback
        if (holdingPeriodsCalculated) {
          const periodsMatch = holdingPeriodsCalculated.match(/(\\d+)/);
          if (periodsMatch) {
            totalPeriods = parseInt(periodsMatch[1]);
          }
        }
        
        console.log('Cost non-linear setup:', { modelPeriods, totalPeriods, holdingPeriodsCalculated });
        
        if (totalPeriods <= 12) {
          // Simple period-by-period input for ≤12 periods
          const periodInputs = [];
          const periodLabel = this.getPeriodLabel(modelPeriods);
          
          for (let i = 1; i <= totalPeriods; i++) {
            periodInputs.push(`
              <div class="year-input-group">
                <label>${periodLabel} ${i}</label>
                <input type="number" id="costNonLinearGrowth_${itemId}_${i}" placeholder="%" step="0.1" value="0"/>
              </div>
            `);
          }
          
          growthInputsContainer.innerHTML = `
            <div class="form-group">
              <label>Period-by-Period Growth Rates (%)</label>
              <div class="non-linear-inputs">
                ${periodInputs.join('')}
              </div>
              <small class="help-text">Set specific growth rate for each ${periodLabel.toLowerCase()}. Positive for cost increase, negative for cost reduction.</small>
            </div>
          `;
        } else {
          // Grouped input for >12 periods
          growthInputsContainer.innerHTML = `
            <div class="form-group">
              <label>Grouped Growth Periods</label>
              <div class="period-groups" id="costPeriodGroups_${itemId}">
                <div class="period-group">
                  <div class="period-group-header">
                    <label>Group 1</label>
                    <button type="button" class="add-period-group" data-cost-item-id="${itemId}">+ Add Group</button>
                  </div>
                  <div class="period-group-inputs">
                    <div class="form-group">
                      <label>From ${this.getPeriodLabel(modelPeriods)}</label>
                      <input type="number" id="costPeriodStart_${itemId}_1" placeholder="1" min="1" max="${totalPeriods}" value="1"/>
                    </div>
                    <div class="form-group">
                      <label>To ${this.getPeriodLabel(modelPeriods)}</label>
                      <input type="number" id="costPeriodEnd_${itemId}_1" placeholder="12" min="1" max="${totalPeriods}" value="12"/>
                    </div>
                    <div class="form-group">
                      <label>Growth Rate (%)</label>
                      <input type="number" id="costPeriodGrowth_${itemId}_1" placeholder="0" step="0.1" value="0"/>
                    </div>
                  </div>
                </div>
              </div>
              <small class="help-text">Define growth rates for period ranges. Example: ${this.getPeriodLabel(modelPeriods)}s 1-12 at 3%, then ${this.getPeriodLabel(modelPeriods)}s 13-${totalPeriods} at 2%</small>
            </div>
          `;
          
          // Add event listener for adding more period groups
          setTimeout(() => {
            const addGroupBtn = document.querySelector(`[data-cost-item-id="${itemId}"]`);
            if (addGroupBtn) {
              addGroupBtn.addEventListener('click', () => this.addCostPeriodGroup(itemId, totalPeriods, modelPeriods));
            }
          }, 100);
        }
        break;
    }
    
    console.log('Updated cost growth inputs for item', itemId, 'with type', growthType);
  }

  updateOpExGrowthInputs(itemId, growthType) {
    const growthInputsContainer = document.getElementById(`opExGrowthInputs_${itemId}`);
    if (!growthInputsContainer) return;
    
    growthInputsContainer.innerHTML = '';
    
    switch (growthType) {
      case 'none':
        growthInputsContainer.innerHTML = `
          <div class="form-group">
            <small class="help-text">This operating expense will remain constant over time</small>
          </div>
        `;
        break;
        
      case 'linear':
        growthInputsContainer.innerHTML = `
          <div class="form-group">
            <label>Annual Growth Rate (%)</label>
            <input type="number" id="linearGrowth_opEx_${itemId}" placeholder="e.g., 3" step="0.1" value="2"/>
            <small class="help-text">Positive for expense increase, negative for expense reduction (e.g., 3% or -2%)</small>
          </div>
        `;
        break;
        
      case 'nonlinear':
        // Similar implementation to cost items but with opEx prefix
        const projectStartDate = document.getElementById('projectStartDate')?.value;
        const projectEndDate = document.getElementById('projectEndDate')?.value;
        const modelPeriods = parseInt(document.getElementById('modelPeriods')?.value) || 12;
        
        if (projectStartDate && projectEndDate) {
          const startDate = new Date(projectStartDate);
          const endDate = new Date(projectEndDate);
          const totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
          const totalPeriods = Math.ceil(totalMonths / modelPeriods) || 1;
          
          growthInputsContainer.innerHTML = `
            <div class="form-group">
              <label>Period-specific Growth Rates</label>
              <small class="help-text">Set different growth rates for different time periods</small>
              <div class="period-groups-container" id="opExPeriodGroups_${itemId}"></div>
            </div>
          `;
          
          setTimeout(() => this.addOpExPeriodGroup(itemId, totalPeriods, modelPeriods), 100);
        }
        break;
    }
    
    console.log('Updated operating expense growth inputs for item', itemId, 'with type', growthType);
  }

  updateCapExGrowthInputs(itemId, growthType) {
    const growthInputsContainer = document.getElementById(`capExGrowthInputs_${itemId}`);
    if (!growthInputsContainer) return;
    
    growthInputsContainer.innerHTML = '';
    
    switch (growthType) {
      case 'none':
        growthInputsContainer.innerHTML = `
          <div class="form-group">
            <small class="help-text">This capital expense will remain constant over time</small>
          </div>
        `;
        break;
        
      case 'linear':
        growthInputsContainer.innerHTML = `
          <div class="form-group">
            <label>Annual Growth Rate (%)</label>
            <input type="number" id="linearGrowth_capEx_${itemId}" placeholder="e.g., 3" step="0.1" value="2"/>
            <small class="help-text">Positive for expense increase, negative for expense reduction (e.g., 3% or -2%)</small>
          </div>
        `;
        break;
        
      case 'nonlinear':
        // Similar implementation to cost items but with capEx prefix
        const projectStartDate = document.getElementById('projectStartDate')?.value;
        const projectEndDate = document.getElementById('projectEndDate')?.value;
        const modelPeriods = parseInt(document.getElementById('modelPeriods')?.value) || 12;
        
        if (projectStartDate && projectEndDate) {
          const startDate = new Date(projectStartDate);
          const endDate = new Date(projectEndDate);
          const totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
          const totalPeriods = Math.ceil(totalMonths / modelPeriods) || 1;
          
          growthInputsContainer.innerHTML = `
            <div class="form-group">
              <label>Period-specific Growth Rates</label>
              <small class="help-text">Set different growth rates for different time periods</small>
              <div class="period-groups-container" id="capExPeriodGroups_${itemId}"></div>
            </div>
          `;
          
          setTimeout(() => this.addCapExPeriodGroup(itemId, totalPeriods, modelPeriods), 100);
        }
        break;
    }
    
    console.log('Updated capital expense growth inputs for item', itemId, 'with type', growthType);
  }

  addCostPeriodGroup(itemId, totalPeriods, modelPeriods) {
    const periodGroupsContainer = document.getElementById(`costPeriodGroups_${itemId}`);
    if (!periodGroupsContainer) return;
    
    const existingGroups = periodGroupsContainer.querySelectorAll('.period-group');
    const groupNumber = existingGroups.length + 1;
    
    // Calculate suggested start period (end of last group + 1)
    const lastGroup = existingGroups[existingGroups.length - 1];
    const lastEndInput = lastGroup.querySelector('[id*="costPeriodEnd_"]');
    const suggestedStart = lastEndInput ? parseInt(lastEndInput.value) + 1 : 1;
    const suggestedEnd = Math.min(suggestedStart + 11, totalPeriods);
    
    const periodLabel = this.getPeriodLabel(modelPeriods);
    
    const newGroup = document.createElement('div');
    newGroup.className = 'period-group';
    newGroup.innerHTML = `
      <div class="period-group-header">
        <label>Group ${groupNumber}</label>
        <button type="button" class="remove-period-group">× Remove</button>
      </div>
      <div class="period-group-inputs">
        <div class="form-group">
          <label>From ${periodLabel}</label>
          <input type="number" id="costPeriodStart_${itemId}_${groupNumber}" placeholder="${suggestedStart}" min="1" max="${totalPeriods}" value="${suggestedStart}"/>
        </div>
        <div class="form-group">
          <label>To ${periodLabel}</label>
          <input type="number" id="costPeriodEnd_${itemId}_${groupNumber}" placeholder="${suggestedEnd}" min="1" max="${totalPeriods}" value="${suggestedEnd}"/>
        </div>
        <div class="form-group">
          <label>Growth Rate (%)</label>
          <input type="number" id="costPeriodGrowth_${itemId}_${groupNumber}" placeholder="0" step="0.1" value="0"/>
        </div>
      </div>
    `;
    
    // Remove the add button from previous groups
    periodGroupsContainer.querySelectorAll('.add-period-group').forEach(btn => btn.remove());
    
    // Add the new group
    periodGroupsContainer.appendChild(newGroup);
    
    // Add the "Add Group" button to the new group if not at total periods
    if (suggestedEnd < totalPeriods) {
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'add-period-group';
      addButton.setAttribute('data-cost-item-id', itemId);
      addButton.textContent = '+ Add Group';
      newGroup.querySelector('.period-group-header').appendChild(addButton);
      
      addButton.addEventListener('click', () => this.addCostPeriodGroup(itemId, totalPeriods, modelPeriods));
    }
    
    // Add remove functionality
    const removeBtn = newGroup.querySelector('.remove-period-group');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        newGroup.remove();
        // Re-add the add button to the last group if needed
        const remainingGroups = periodGroupsContainer.querySelectorAll('.period-group');
        const lastRemainingGroup = remainingGroups[remainingGroups.length - 1];
        if (lastRemainingGroup && !lastRemainingGroup.querySelector('.add-period-group')) {
          const lastEndInput = lastRemainingGroup.querySelector('[id*="costPeriodEnd_"]');
          const lastEnd = lastEndInput ? parseInt(lastEndInput.value) : 0;
          if (lastEnd < totalPeriods) {
            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.className = 'add-period-group';
            addButton.setAttribute('data-cost-item-id', itemId);
            addButton.textContent = '+ Add Group';
            lastRemainingGroup.querySelector('.period-group-header').appendChild(addButton);
            
            addButton.addEventListener('click', () => this.addCostPeriodGroup(itemId, totalPeriods, modelPeriods));
          }
        }
      });
    }
    
    console.log('Added cost period group', groupNumber, 'for item', itemId);
  }

  initializeExitAssumptions() {
    console.log('Initializing exit assumptions...');
    
    setTimeout(() => {
      const disposalCost = document.getElementById('disposalCost');
      const terminalCapRate = document.getElementById('terminalCapRate');
      
      console.log('Exit assumptions elements found:', {
        disposalCost: !!disposalCost,
        terminalCapRate: !!terminalCapRate
      });
      
      // Function to validate exit assumption inputs
      const validateExitInputs = () => {
        const disposalValue = parseFloat(disposalCost?.value) || 0;
        const capRateValue = parseFloat(terminalCapRate?.value) || 0;
        
        // Log values for debugging
        console.log('Exit assumptions values:', {
          disposalCost: disposalValue,
          terminalCapRate: capRateValue
        });
        
        // Validate ranges (optional - could add visual feedback here)
        if (disposalValue < 0 || disposalValue > 10) {
          console.warn('Disposal cost outside typical range (0-10%)');
        }
        
        if (capRateValue < 0 || capRateValue > 20) {
          console.warn('Terminal cap rate outside typical range (0-20%)');
        }
      };
      
      // Add event listeners for real-time validation
      if (disposalCost) {
        disposalCost.addEventListener('input', validateExitInputs);
      }
      
      if (terminalCapRate) {
        terminalCapRate.addEventListener('input', validateExitInputs);
      }
      
      // Initial validation
      validateExitInputs();
      
      console.log('✅ Exit assumptions initialized successfully');
    }, 500);
  }

  initializeSectionMonitoring() {
    console.log('Initializing section completion monitoring...');
    
    // Set up event listeners to monitor form changes
    setTimeout(() => {
      // Monitor all input changes
      const inputs = document.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        input.addEventListener('input', () => this.debounceUpdateSectionIndicators());
        input.addEventListener('change', () => this.debounceUpdateSectionIndicators());
      });
      
      // Monitor dynamic item additions/removals
      const addButtons = document.querySelectorAll('[id*="add"]');
      addButtons.forEach(button => {
        button.addEventListener('click', () => {
          setTimeout(() => this.updateSectionIndicators(), 500);
        });
      });
      
      // Initial update
      this.updateSectionIndicators();
      
      console.log('✅ Section monitoring initialized successfully');
    }, 1000);
  }

  debounceUpdateSectionIndicators() {
    clearTimeout(this.sectionUpdateTimeout);
    this.sectionUpdateTimeout = setTimeout(() => {
      this.updateSectionIndicators();
    }, 300);
  }

  updateSectionIndicators() {
    // High-Level Parameters
    const highLevelComplete = this.checkHighLevelParametersCompletion();
    this.updateSectionIndicator('highLevelIndicator', 'highLevelParametersSection', highLevelComplete);
    
    // Deal Assumptions
    const dealAssumptionsComplete = this.checkDealAssumptionsCompletion();
    this.updateSectionIndicator('dealAssumptionsIndicator', 'dealAssumptionsSection', dealAssumptionsComplete);
    
    // Revenue Items
    const revenueItemsComplete = this.checkRevenueItemsCompletion();
    this.updateSectionIndicator('revenueItemsIndicator', 'revenueItemsSection', revenueItemsComplete);
    
    // Operating Expenses
    const operatingExpensesComplete = this.checkOperatingExpensesCompletion();
    this.updateSectionIndicator('operatingExpensesIndicator', 'operatingExpensesSection', operatingExpensesComplete);
    
    // Capital Expenses
    const capitalExpensesComplete = this.checkCapitalExpensesCompletion();
    this.updateSectionIndicator('capitalExpensesIndicator', 'capitalExpensesSection', capitalExpensesComplete);
    
    // Exit Assumptions
    const exitAssumptionsComplete = this.checkExitAssumptionsCompletion();
    this.updateSectionIndicator('exitAssumptionsIndicator', 'exitAssumptionsSection', exitAssumptionsComplete);
    
    // Debt Model (optional section)
    const debtModelComplete = this.checkDebtModelCompletion();
    this.updateSectionIndicator('debtModelIndicator', 'debtModelSection', debtModelComplete);
  }

  updateSectionIndicator(indicatorId, sectionId, completionStatus) {
    const indicator = document.getElementById(indicatorId);
    const section = document.getElementById(sectionId);
    
    if (indicator && section) {
      // Remove all existing classes
      indicator.classList.remove('complete', 'incomplete', 'partial');
      section.classList.remove('complete', 'incomplete', 'partial');
      
      // Add new classes based on completion status
      if (completionStatus === 'complete') {
        indicator.classList.add('complete');
        section.classList.add('complete');
        indicator.textContent = '✓';
      } else if (completionStatus === 'partial') {
        indicator.classList.add('partial');
        section.classList.add('partial');
        indicator.textContent = '~';
      } else {
        indicator.classList.add('incomplete');
        section.classList.add('incomplete');
        indicator.textContent = '!';
      }
    }
  }

  checkHighLevelParametersCompletion() {
    const currency = document.getElementById('currency')?.value;
    const projectStartDate = document.getElementById('projectStartDate')?.value;
    const projectEndDate = document.getElementById('projectEndDate')?.value;
    const modelPeriods = document.getElementById('modelPeriods')?.value;
    
    const requiredFields = [currency, projectStartDate, projectEndDate, modelPeriods];
    const completedFields = requiredFields.filter(field => field && field.trim() !== '').length;
    
    if (completedFields === requiredFields.length) return 'complete';
    if (completedFields > 0) return 'partial';
    return 'incomplete';
  }

  checkDealAssumptionsCompletion() {
    const dealName = document.getElementById('dealName')?.value;
    const dealValue = document.getElementById('dealValue')?.value;
    const transactionFee = document.getElementById('transactionFee')?.value;
    const dealLTV = document.getElementById('dealLTV')?.value;
    
    const requiredFields = [dealName, dealValue, transactionFee, dealLTV];
    const completedFields = requiredFields.filter(field => field && field.trim() !== '').length;
    
    if (completedFields === requiredFields.length) return 'complete';
    if (completedFields > 0) return 'partial';
    return 'incomplete';
  }

  checkRevenueItemsCompletion() {
    const revenueItems = this.collectRevenueItems();
    if (revenueItems.length === 0) return 'incomplete';
    
    const completeItems = revenueItems.filter(item => 
      item.name && item.name.trim() !== '' && 
      item.value && item.value > 0
    ).length;
    
    if (completeItems === revenueItems.length) return 'complete';
    if (completeItems > 0) return 'partial';
    return 'incomplete';
  }

  checkOperatingExpensesCompletion() {
    const operatingExpenses = this.collectOperatingExpenses();
    if (operatingExpenses.length === 0) return 'incomplete';
    
    const completeItems = operatingExpenses.filter(item => 
      item.name && item.name.trim() !== '' && 
      item.value && item.value > 0
    ).length;
    
    if (completeItems === operatingExpenses.length) return 'complete';
    if (completeItems > 0) return 'partial';
    return 'incomplete';
  }

  checkCapitalExpensesCompletion() {
    const capitalExpenses = this.collectCapitalExpenses();
    if (capitalExpenses.length === 0) return 'incomplete';
    
    const completeItems = capitalExpenses.filter(item => 
      item.name && item.name.trim() !== '' && 
      item.value && item.value > 0
    ).length;
    
    if (completeItems === capitalExpenses.length) return 'complete';
    if (completeItems > 0) return 'partial';
    return 'incomplete';
  }

  checkExitAssumptionsCompletion() {
    const disposalCost = document.getElementById('disposalCost')?.value;
    const terminalCapRate = document.getElementById('terminalCapRate')?.value;
    
    const requiredFields = [disposalCost, terminalCapRate];
    const completedFields = requiredFields.filter(field => field && field.trim() !== '').length;
    
    if (completedFields === requiredFields.length) return 'complete';
    if (completedFields > 0) return 'partial';
    return 'incomplete';
  }

  checkDebtModelCompletion() {
    const debtYes = document.getElementById('debtYes')?.checked;
    const debtNo = document.getElementById('debtNo')?.checked;
    
    if (debtNo) return 'complete'; // No debt selected is considered complete
    
    if (debtYes) {
      // Check debt-specific fields
      const marginRate = document.getElementById('marginRate')?.value;
      const arrangementFee = document.getElementById('arrangementFee')?.value;
      
      if (marginRate && arrangementFee) return 'complete';
      if (marginRate || arrangementFee) return 'partial';
      return 'incomplete';
    }
    
    return 'partial'; // Neither option selected
  }

  autoLoadSavedData() {
    console.log('Checking for saved data to auto-load...');
    
    setTimeout(() => {
      try {
        const savedData = localStorage.getItem('maModelingData');
        
        if (savedData) {
          const formData = JSON.parse(savedData);
          console.log('Found saved data, auto-loading...');
          
          // Only auto-load basic fields, not dynamic items (user can manually load those)
          Object.keys(formData).forEach(key => {
            const element = document.getElementById(key);
            if (element && !['revenueItems', 'operatingExpenses', 'capitalExpenses', 'costItems', 'savedAt'].includes(key)) {
              if (element.type === 'checkbox' || element.type === 'radio') {
                element.checked = formData[key];
              } else {
                element.value = formData[key];
              }
            }
          });
          
          // Trigger recalculations and update indicators
          this.triggerCalculations();
          setTimeout(() => this.updateSectionIndicators(), 500);
          
          console.log('Auto-load completed');
        } else {
          console.log('No saved data found');
        }
      } catch (error) {
        console.warn('Error auto-loading saved data:', error);
      }
    }, 1500); // Load after all other initialization is complete
  }

  async processAutoFill() {
    console.log('🤖 processAutoFill function needs to be updated to use separate batch process files');
    
    // TODO: Update this function to use the separate batch process files
    // This function previously called removed duplicate functions:
    // - processMainUploadedFiles()
    // - processBatchExtraction()
    // - applyExtractedData()
    // - createExtractionSummary()
    // - getCompleteMockDataset()
    
    if (!this.mainUploadedFiles || this.mainUploadedFiles.length === 0) {
      this.showMainUploadMessage('No files uploaded for processing.', 'error');
      return;
    }
    
    this.showMainUploadMessage('Auto-fill functionality is being updated to use separate batch process files.', 'info');
  }

  // Removed duplicate batch processing functions - using separate files
  // Removed all duplicate extraction and prompt functions - using separate batch process files

  // Removed processMainUploadedFiles - using separate batch process files

  // Removed createDataExtractionPrompt - using separate batch process files

  // Removed applyExtractedData function - using separate batch process files

  setInputValue(elementId, value) {
    const element = document.getElementById(elementId);
    console.log(`🔧 setInputValue - Element ${elementId}:`, !!element, 'Value:', value);
    if (element && value !== null && value !== undefined) {
      element.value = value;
      console.log(`🔧 setInputValue - Successfully set ${elementId} to:`, value);
      // Trigger change event to update calculations
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      console.warn(`🔧 setInputValue - Failed to set ${elementId}: element=${!!element}, value=${value}`);
    }
  }

  // Removed applyRevenueItems function - using separate batch process files

  // Removed applyCostItems function - using separate batch process files

  // Removed applyOperatingExpenses function - using separate batch process files

  // Removed applyCapitalExpenses function - using separate batch process files

  triggerCalculations() {
    // Trigger holding period calculations
    const projectStartDate = document.getElementById('projectStartDate');
    if (projectStartDate) {
      projectStartDate.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Trigger deal assumptions calculations
    const dealValue = document.getElementById('dealValue');
    if (dealValue) {
      dealValue.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Trigger debt eligibility check
    const dealLTV = document.getElementById('dealLTV');
    if (dealLTV) {
      dealLTV.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async getExcelContext() {
    try {
      return await Excel.run(async (context) => {
        const worksheet = context.workbook.worksheets.getActiveWorksheet();
        const selectedRange = context.workbook.getSelectedRange();
        const usedRange = worksheet.getUsedRange();
        
        worksheet.load(['name']);
        selectedRange.load(['address', 'values', 'formulas']);
        usedRange.load(['address', 'values', 'formulas']);
        
        await context.sync();
        
        return JSON.stringify({
          worksheetName: worksheet.name,
          selectedRange: {
            address: selectedRange.address,
            values: selectedRange.values,
            formulas: selectedRange.formulas
          },
          usedRange: {
            address: usedRange.address,
            values: usedRange.values.slice(0, 10), // Limit to first 10 rows
            formulas: usedRange.formulas.slice(0, 10)
          }
        });
      });
    } catch {
      return JSON.stringify({ error: 'Could not read Excel context' });
    }
  }
}

// Global error handler for better debugging
window.addEventListener('error', (e) => {
  console.error('Global error caught:', e.error, e.filename, e.lineno);
});

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});

// Initialize the add-in only once
if (!window.maModelingAddin) {
  console.log('Initializing MAModelingAddin...');
  console.log('Office availability:', typeof Office !== 'undefined');
  console.log('Excel availability:', typeof Excel !== 'undefined');

  // Wait for everything to load properly
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!window.maModelingAddin) {
        console.log('DOM loaded, creating MAModelingAddin');
        window.maModelingAddin = new MAModelingAddin();
      }
    });
  } else {
    console.log('DOM already loaded, creating MAModelingAddin');
    window.maModelingAddin = new MAModelingAddin();
  }
} else {
  console.log('MAModelingAddin already initialized, skipping');
}