'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { FormField, inputClass, selectClass } from '@/components/ui/Modal';
import { FileText, Printer, Download, Eye, ArrowLeft } from 'lucide-react';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

const TEMPLATES = {
  nda: {
    id: 'nda',
    name: 'Non-Disclosure Agreement',
    description: 'Standard mutual NDA for protecting confidential information.',
    fields: ['partyOne', 'partyTwo', 'effectiveDate', 'jurisdiction'],
    generate: (data: any) => `
# NON-DISCLOSURE AGREEMENT

**THIS NON-DISCLOSURE AGREEMENT** (this "Agreement") is entered into on **${data.effectiveDate || '[Effective Date]'}**, by and between:

**1. ATEON Labs PRIVATE LIMITED**, a company incorporated under the laws of India, having its principal place of business at [Address] (hereinafter referred to as the "Disclosing Party"); and

**2. ${data.partyTwo || '[Counterparty Name]'}**, having its principal address at [Counterparty Address] (hereinafter referred to as the "Receiving Party").

## 1. PURPOSE
The parties wish to explore a potential business relationship in connection with which the Disclosing Party may disclose certain confidential information to the Receiving Party.

## 2. CONFIDENTIAL INFORMATION
"Confidential Information" means any and all technical and non-technical information including patent, copyright, trade secret, and proprietary information, techniques, sketches, drawings, models, inventions, know-how, processes, apparatus, equipment, algorithms, software programs, software source documents, and formulae related to the current, future, and proposed products and services of each of the parties.

## 3. NON-DISCLOSURE
The Receiving Party agrees not to use any Confidential Information of the Disclosing Party for any purpose except to evaluate and engage in discussions concerning a potential business relationship between the parties.

## 4. TERM
This Agreement shall govern all communications between the parties. Either party may terminate this Agreement upon written notice to the other party. The Receiving Party's obligations under this Agreement shall survive termination of the Agreement and shall be binding upon the Receiving Party's heirs, successors, and assigns for a period of five (5) years.

## 5. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of ${data.jurisdiction || 'India'}.

**IN WITNESS WHEREOF**, the parties have executed this Agreement as of the date first written above.

**ATEON Labs PRIVATE LIMITED**
By: ___________________________
Name: _________________________
Title: ________________________

**${data.partyTwo || '[Counterparty Name]'}**
By: ___________________________
Name: _________________________
Title: ________________________
    `
  },
  employment: {
    id: 'employment',
    name: 'Employment Agreement',
    description: 'Standard employment contract including ESOP terms.',
    fields: ['partyTwo', 'effectiveDate', 'designation', 'salary', 'esop'],
    generate: (data: any) => `
# EMPLOYMENT AGREEMENT

**THIS EMPLOYMENT AGREEMENT** is made on **${data.effectiveDate || '[Effective Date]'}** between:

**1. ATEON Labs PRIVATE LIMITED** (the "Company"); and
**2. ${data.partyTwo || '[Employee Name]'}** (the "Employee").

## 1. POSITION AND DUTIES
The Company agrees to employ the Employee as **${data.designation || '[Designation]'}**. The Employee shall perform such duties as are customarily associated with such position and as may be assigned from time to time by the Company.

## 2. COMPENSATION
The Employee's base salary shall be **₹${data.salary || '[Salary Amount]'}** per annum, payable in accordance with the Company's standard payroll practices.

## 3. ESOP (EMPLOYEE STOCK OWNERSHIP PLAN)
Subject to the approval of the Company's Board of Directors, the Employee will be granted an option to purchase **${data.esop || '0'}** shares of the Company's common stock.

## 4. CONFIDENTIALITY AND IP ASSIGNMENT
The Employee agrees to sign the Company's standard Confidentiality and Intellectual Property Assignment Agreement upon joining.

## 5. TERMINATION
Employment with the Company is "at-will," meaning that either the Employee or the Company may terminate the employment relationship at any time, with or without cause, and with or without notice.

**IN WITNESS WHEREOF**, the parties have executed this Agreement as of the date first written above.

**ATEON Labs PRIVATE LIMITED**
By: ___________________________
Name: _________________________
Title: ________________________

**EMPLOYEE**
By: ___________________________
Name: ${data.partyTwo || '[Employee Name]'}
    `
  },
  founder: {
    id: 'founder',
    name: 'Founder Agreement',
    description: 'Agreement for co-founders detailing equity and vesting.',
    fields: ['partyOne', 'partyTwo', 'effectiveDate', 'equity'],
    generate: (data: any) => `
# FOUNDERS AGREEMENT

**THIS AGREEMENT** is entered into on **${data.effectiveDate || '[Effective Date]'}** between:

**1. ${data.partyOne || '[Founder 1 Name]'}**; and
**2. ${data.partyTwo || '[Founder 2 Name]'}**.

## 1. THE COMPANY
The Founders have formed or intend to form a company named **ATEON Labs PRIVATE LIMITED** (the "Company").

## 2. EQUITY OWNERSHIP
The total issued equity of the Company shall be divided as follows:
- ${data.partyOne || 'Founder 1'}: ${data.equity ? 100 - Number(data.equity) : '50'}%
- ${data.partyTwo || 'Founder 2'}: ${data.equity || '50'}%

## 3. VESTING
The equity assigned to each Founder shall be subject to a four (4) year vesting schedule with a one (1) year cliff.

## 4. ROLES AND RESPONSIBILITIES
Each Founder agrees to devote their full business time and attention to the Company.

**IN WITNESS WHEREOF**, the Founders have executed this Agreement as of the date first written above.

**FOUNDER 1**
By: ___________________________
Name: ${data.partyOne || '[Founder 1 Name]'}

**FOUNDER 2**
By: ___________________________
Name: ${data.partyTwo || '[Founder 2 Name]'}
    `
  }
};

export default function LegalPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  
  const template = selectedTemplate ? TEMPLATES[selectedTemplate as keyof typeof TEMPLATES] : null;

  const handlePrint = () => {
    window.print();
  };

  if (template) {
    const generatedMarkdown = template.generate(formData);
    // Extremely simple markdown to HTML for preview
    const htmlContent = generatedMarkdown
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mb-4">$1</h1>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\n/gim, '<br/>')
      .replace(/___+/gim, '<span class="inline-block w-48 border-b border-gray-400"></span>');

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between no-print">
          <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => setSelectedTemplate(null)}>
            Back to Templates
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={<Download size={16} />}>Download Softcopy</Button>
            <Button icon={<Printer size={16} />} onClick={handlePrint}>Print to Stamp Paper</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4 no-print bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-max">
            <h3 className="font-semibold text-lg border-b border-gray-100 pb-2 mb-4">Document Details</h3>
            
            {template.fields.includes('partyOne') && (
              <FormField label="Party 1 (Company/Founder 1)">
                <input className={inputClass} value={formData.partyOne || 'ATEON Labs PRIVATE LIMITED'} onChange={e => setFormData({ ...formData, partyOne: e.target.value })} />
              </FormField>
            )}
            
            {template.fields.includes('partyTwo') && (
              <FormField label="Party 2 (Counterparty/Employee/Founder 2)">
                <input className={inputClass} placeholder="e.g. John Doe" value={formData.partyTwo || ''} onChange={e => setFormData({ ...formData, partyTwo: e.target.value })} />
              </FormField>
            )}
            
            {template.fields.includes('effectiveDate') && (
              <FormField label="Effective Date">
                <input type="date" className={inputClass} value={formData.effectiveDate || ''} onChange={e => setFormData({ ...formData, effectiveDate: e.target.value })} />
              </FormField>
            )}

            {template.fields.includes('designation') && (
              <FormField label="Designation">
                <input className={inputClass} placeholder="e.g. Senior Engineer" value={formData.designation || ''} onChange={e => setFormData({ ...formData, designation: e.target.value })} />
              </FormField>
            )}

            {template.fields.includes('salary') && (
              <FormField label="Annual Salary (₹)">
                <input type="number" className={inputClass} placeholder="e.g. 1200000" value={formData.salary || ''} onChange={e => setFormData({ ...formData, salary: e.target.value })} />
              </FormField>
            )}

            {template.fields.includes('esop') && (
              <FormField label="ESOP Shares">
                <input type="number" className={inputClass} placeholder="e.g. 5000" value={formData.esop || ''} onChange={e => setFormData({ ...formData, esop: e.target.value })} />
              </FormField>
            )}

            {template.fields.includes('equity') && (
              <FormField label="Founder 2 Equity (%)">
                <input type="number" min="0" max="100" className={inputClass} placeholder="e.g. 50" value={formData.equity || ''} onChange={e => setFormData({ ...formData, equity: e.target.value })} />
              </FormField>
            )}

            {template.fields.includes('jurisdiction') && (
              <FormField label="Jurisdiction">
                <input className={inputClass} placeholder="e.g. India" value={formData.jurisdiction || 'India'} onChange={e => setFormData({ ...formData, jurisdiction: e.target.value })} />
              </FormField>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white p-12 rounded-xl border border-gray-200 shadow-sm print:shadow-none print:border-none print:p-0 font-serif text-gray-800 leading-relaxed document-preview">
              <style dangerouslySetInnerHTML={{__html: `
                @media print {
                  body * { visibility: hidden; }
                  .document-preview, .document-preview * { visibility: visible; }
                  .document-preview { position: absolute; left: 0; top: 0; width: 100%; }
                  .no-print { display: none !important; }
                  /* Stamp paper margin top usually 10-15cm */
                  @page { margin-top: 12cm; margin-bottom: 2cm; margin-left: 2cm; margin-right: 2cm; }
                }
              `}} />
              <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Legal Documents</h1>
          <p className="text-gray-500 text-sm mt-1">Generate automated agreements and compliance papers</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.values(TEMPLATES).map(temp => (
          <motion.div key={temp.id} variants={item}>
            <Card variant="default" hover className="h-full flex flex-col cursor-pointer" onClick={() => setSelectedTemplate(temp.id)}>
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-4 text-gray-700">
                <FileText size={24} />
              </div>
              <h3 className="text-lg font-semibold mb-2">{temp.name}</h3>
              <p className="text-sm text-gray-500 flex-1">{temp.description}</p>
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-sm font-medium text-gray-900">
                <span>Generate</span>
                <ArrowLeft size={16} className="rotate-180" />
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
