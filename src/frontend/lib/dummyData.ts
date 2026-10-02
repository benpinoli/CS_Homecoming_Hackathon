// Placeholder content used while a backend function's flag in dev.ts is false.
import type { GeneratedResume, PhotoAdvice, ResumeImport, TailoringPoint } from '../types'

export const DUMMY_RESUME: GeneratedResume = {
  name: 'Jordan Smith',
  email: 'jordan@example.com',
  phone: '(555) 123-4567',
  location: 'Denver, CO',
  links: ['linkedin.com/in/jordansmith'],
  summary: 'Operations manager with 6+ years of experience leading teams, streamlining processes, and delivering projects on time and under budget.',
  experience: [
    {
      company: 'Summit Logistics',
      position: 'Operations Manager',
      location: 'Denver, CO',
      duration: 'Jun 2021 – Present',
      bullets: [
        'Led a team of 12 across scheduling, inventory, and customer support.',
        'Redesigned the dispatch process, reducing delivery delays by 25%.',
      ]
    },
    {
      company: 'Front Range Supply Co.',
      position: 'Operations Coordinator',
      location: 'Boulder, CO',
      duration: 'Jul 2018 – May 2021',
      bullets: [
        'Coordinated vendor contracts and managed a $1.2M annual purchasing budget.',
        'Trained 20+ new hires on safety and quality procedures.',
      ]
    }
  ],
  projects: [
    {
      name: 'Warehouse Consolidation',
      technologies: 'Budgeting, vendor negotiation, change management',
      link: '',
      bullets: ['Merged two facilities into one, saving $180K per year with no service interruption.']
    }
  ],
  education: [
    {
      school: 'University of Colorado',
      degree: 'B.A.',
      field: 'Business Administration',
      year: 'May 2018',
      details: 'Magna Cum Laude'
    }
  ],
  skills: ['Team leadership', 'Process improvement', 'Budgeting', 'Vendor management', 'Excel', 'Project planning']
}

export const DUMMY_TAILORING: TailoringPoint[] = [
  {
    id: '1',
    area: 'Summary',
    detail: 'Leads with team leadership and process improvement, the two themes the listing repeats most.'
  },
  {
    id: '2',
    area: 'Experience',
    detail: 'Pulled the Summit Logistics achievements that show people management and measurable efficiency gains.'
  },
  {
    id: '3',
    area: 'Projects',
    detail: 'Included the warehouse consolidation because the listing asks for budget ownership.'
  },
  {
    id: '4',
    area: 'Skills',
    detail: 'Ordered skills to put the listing’s keywords first: team leadership, process improvement, and vendor management.'
  },
  {
    id: '5',
    area: 'Photo',
    detail: 'We left the photo off. Open Edit → Photo to add one anyway.'
  },
  {
    id: '6',
    area: 'Left out',
    detail: 'Older, unrelated roles were omitted to keep the resume focused and to one page.'
  }
]

export const DUMMY_PHOTO_ADVICE: PhotoAdvice = {
  recommended: false,
  reason: 'Photos are uncommon on US corporate and operations resumes, and some employers prefer to leave them out to avoid bias. Skip it unless the listing asks for one.'
}

export const DUMMY_RESUME_IMPORT: ResumeImport = {
  data: {
    profile: [{
      name: 'Jordan Smith',
      email: 'jordan@example.com',
      phone: '(555) 123-4567',
      location: 'Denver, CO',
      linkedin: 'linkedin.com/in/jordansmith',
      website: '',
      summary: 'Operations manager with 6+ years of experience leading teams and streamlining processes.',
    }],
    experience: [
      {
        company: 'Summit Logistics',
        position: 'Operations Manager',
        location: 'Denver, CO',
        startDate: 'Jun 2021',
        endDate: 'Present',
        description: 'Led a team of 12 across scheduling, inventory, and customer support.\nRedesigned the dispatch process, reducing delivery delays by 25%.',
      },
      {
        company: 'Front Range Supply Co.',
        position: 'Operations Coordinator',
        location: 'Boulder, CO',
        startDate: 'Jul 2018',
        endDate: 'May 2021',
        description: 'Managed a $1.2M annual purchasing budget.\nTrained 20+ new hires on safety and quality procedures.',
      },
    ],
    education: [{
      school: 'University of Colorado',
      degree: 'B.A.',
      field: 'Business Administration',
      location: 'Boulder, CO',
      startDate: 'Aug 2014',
      endDate: 'May 2018',
      gpa: '',
      details: 'Magna Cum Laude',
    }],
    projects: [{
      name: 'Warehouse Consolidation',
      role: 'Project lead',
      technologies: 'Budgeting, vendor negotiation, change management',
      link: '',
      startDate: '',
      endDate: '',
      description: 'Merged two facilities into one, saving $180K per year with no service interruption.',
    }],
    skills: [
      { name: 'Team leadership', category: 'Leadership' },
      { name: 'Process improvement', category: 'Operations' },
      { name: 'Budgeting', category: 'Finance' },
      { name: 'Vendor management', category: 'Operations' },
      { name: 'Excel', category: 'Software' },
    ],
    volunteer: [{
      organization: 'Local Food Bank',
      role: 'Volunteer Coordinator',
      startDate: 'Sep 2019',
      endDate: 'Present',
      description: 'Scheduled and supervised 30 weekly volunteers.',
    }],
    certifications: [{ name: 'Project Management Professional (PMP)', issuer: 'Project Management Institute', date: '2022' }],
  },
  warnings: [
    'The end date of “Front Range Supply Co.” was hard to read. Check it.',
    'No GPA was found, so that field was left blank.',
  ],
}
