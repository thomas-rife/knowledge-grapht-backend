export const testStudentClassIDs = [1, 2, 3, 4]

export const testStudentClasses = [
  {
    class_id: 1,
    name: 'CMSI 1010: Intro to Programming',
    section_number: '01',
    description: 'test 1010 class',
  },
  {
    class_id: 2,
    name: 'CMSI 2120: Data Structures',
    section_number: '01',
    description: 'test DS class',
  },
  {
    class_id: 3,
    name: 'CMSI 3801: Languages and Automata',
    section_number: '01',
    description: 'test p-lang class',
  },
  {
    class_id: 4,
    name: 'CMSI 3330: Artificial Intelligence',
    section_number: '01',
    description: 'test AI class',
  },
]

export const testStudentLessonIDs = [1, 2, 3, 4]

export const testStudentLessons = [
  {
    lesson_id: 1,
    name: 'Pygame',
    topics: ['test topic 1', 'test topic 2'],
  },
  {
    lesson_id: 2,
    name: 'Priority Queues',
    topics: ['test topic 1', 'test topic 3', 'test topic 4', 'test topic 6'],
  },
  {
    lesson_id: 3,
    name: 'JavaScript',
    topics: ['test topic 1', 'test topic 2', 'test topic 7'],
  },
  {
    lesson_id: 4,
    name: 'Propositional Logic',
    topics: ['test topic 1', 'test topic 2', 'test topic 3', 'test topic 4'],
  },
]

export const testStudentQuestionIDs = [1, 2, 3, 4, 5, 6, 7, 8]

export const testStudentLessonQuestions = [
  {
    question_id: 1,
    question_type: 'Multiple Choice',
    prompt: 'This is a prompt that the user should answer.',
    snippet: 'This is a snippet to hopefully help the user.',
    topics: ['topic 1', 'topic 2'],
    answer_options: ['Test Answer 1', 'Test Answer 2', 'Test Answer 3', 'Test Answer 4'],
    answer: 'Test Answer 1',
  },
  {
    question_id: 2,
    question_type: 'Multiple Choice',
    prompt: 'This is a prompt that the user should answer.',
    snippet: 'This is a snippet to hopefully help the user.',
    topics: ['topic 1', 'topic 2'],
    answer_options: ['Test Answer 1', 'Test Answer 2', 'Test Answer 3', 'Test Answer 4'],
    answer: 'Test Answer 2',
  },
  {
    question_id: 3,
    question_type: 'Multiple Choice',
    prompt: 'This is a prompt that the user should answer 3.',
    snippet: 'This is a snippet to hopefully help the user 3.',
    topics: ['topic 1', 'topic 2'],
    answer_options: ['Test Answer 1', 'Test Answer 2', 'Test Answer 3', 'Test Answer 4'],
    answer: 'Test Answer 2',
  },
  {
    question_id: 4,
    question_type: 'Multiple Choice',
    prompt: 'This is a prompt that the user should answer 4.',
    snippet: 'This is a snippet to hopefully help the user 4.',
    topics: ['topic 1', 'topic 2'],
    answer_options: ['Test Answer 1', 'Test Answer 2', 'Test Answer 3', 'Test Answer 4'],
    answer: 'Test Answer 2',
  },
]

export const testStudentKGs = [
  {
    class_id: 1,
    graph_id: 1,
    nodes: ['topic 1', 'topic 2', 'topic 3', 'topic 4'],
    edges: [
      ['topic 1', 'topic 2'],
      ['topic 1', 'topic 3'],
      ['topic 2', 'topic 3'],
      ['topic 3', 'topic 4'],
    ],
    react_flow_data: [
      {
        reactFlowEdges: [
          {
            id: 'topic 1-topic 2',
            source: 'topic 1',
            target: 'topic 2',
            animated: true,
          },
          {
            id: 'topic 1-topic 3',
            source: 'topic 1',
            target: 'topic 3',
            animated: true,
          },
          {
            id: 'topic 2-topic 3',
            source: 'topic 2',
            target: 'topic 3',
            animated: true,
          },
          {
            id: 'topic 3-topic 4',
            source: 'topic 3',
            target: 'topic 4',
            animated: true,
          },
        ],
        reactFlowNodes: [
          {
            id: 'topic 1',
            data: { label: 'topic 1' },
            type: 'default',
            position: { x: 100, y: 100 },
          },
          {
            id: 'topic 2',
            data: { label: 'topic 2' },
            type: 'default',
            position: { x: 300, y: 100 },
          },
          {
            id: 'topic 3',
            data: { label: 'topic 3' },
            type: 'default',
            position: { x: 300, y: 300 },
          },
          {
            id: 'topic 4',
            data: { label: 'topic 4' },
            type: 'default',
            position: { x: 500, y: 300 },
          },
        ],
      },
    ],
  },
  {
    class_id: 2,
    graph_id: 2,
    nodes: ['topic 1', 'topic 2', 'topic 3', 'topic 4'],
    edges: [
      ['topic 1', 'topic 2'],
      ['topic 1', 'topic 3'],
      ['topic 2', 'topic 3'],
      ['topic 3', 'topic 4'],
    ],
    react_flow_data: [
      {
        reactFlowEdges: [
          {
            id: 'topic 1-topic 2',
            source: 'topic 1',
            target: 'topic 2',
            animated: true,
          },
          {
            id: 'topic 1-topic 3',
            source: 'topic 1',
            target: 'topic 3',
            animated: true,
          },
          {
            id: 'topic 2-topic 3',
            source: 'topic 2',
            target: 'topic 3',
            animated: true,
          },
          {
            id: 'topic 3-topic 4',
            source: 'topic 3',
            target: 'topic 4',
            animated: true,
          },
        ],
        reactFlowNodes: [
          {
            id: 'topic 1',
            data: { label: 'topic 1' },
            type: 'default',
            position: { x: 100, y: 100 },
          },
          {
            id: 'topic 2',
            data: { label: 'topic 2' },
            type: 'default',
            position: { x: 300, y: 100 },
          },
          {
            id: 'topic 3',
            data: { label: 'topic 3' },
            type: 'default',
            position: { x: 300, y: 300 },
          },
          {
            id: 'topic 4',
            data: { label: 'topic 4' },
            type: 'default',
            position: { x: 500, y: 300 },
          },
        ],
      },
    ],
  },
  {
    class_id: 3,
    graph_id: 3,
    nodes: ['topic 1', 'topic 2', 'topic 3', 'topic 4'],
    edges: [
      ['topic 1', 'topic 2'],
      ['topic 1', 'topic 3'],
      ['topic 2', 'topic 3'],
      ['topic 3', 'topic 4'],
    ],
    react_flow_data: [
      {
        reactFlowEdges: [
          {
            id: 'topic 1-topic 2',
            source: 'topic 1',
            target: 'topic 2',
            animated: true,
          },
          {
            id: 'topic 1-topic 3',
            source: 'topic 1',
            target: 'topic 3',
            animated: true,
          },
          {
            id: 'topic 2-topic 3',
            source: 'topic 2',
            target: 'topic 3',
            animated: true,
          },
          {
            id: 'topic 3-topic 4',
            source: 'topic 3',
            target: 'topic 4',
            animated: true,
          },
        ],
        reactFlowNodes: [
          {
            id: 'topic 1',
            data: { label: 'topic 1' },
            type: 'default',
            position: { x: 100, y: 100 },
          },
          {
            id: 'topic 2',
            data: { label: 'topic 2' },
            type: 'default',
            position: { x: 300, y: 100 },
          },
          {
            id: 'topic 3',
            data: { label: 'topic 3' },
            type: 'default',
            position: { x: 300, y: 300 },
          },
          {
            id: 'topic 4',
            data: { label: 'topic 4' },
            type: 'default',
            position: { x: 500, y: 300 },
          },
        ],
      },
    ],
  },
  {
    class_id: 4,
    graph_id: 4,
    nodes: ['topic 1', 'topic 2', 'topic 3', 'topic 4'],
    edges: [
      ['topic 1', 'topic 2'],
      ['topic 1', 'topic 3'],
      ['topic 2', 'topic 3'],
      ['topic 3', 'topic 4'],
    ],
    react_flow_data: [
      {
        reactFlowEdges: [
          {
            id: 'topic 1-topic 2',
            source: 'topic 1',
            target: 'topic 2',
            animated: true,
          },
          {
            id: 'topic 1-topic 3',
            source: 'topic 1',
            target: 'topic 3',
            animated: true,
          },
          {
            id: 'topic 2-topic 3',
            source: 'topic 2',
            target: 'topic 3',
            animated: true,
          },
          {
            id: 'topic 3-topic 4',
            source: 'topic 3',
            target: 'topic 4',
            animated: true,
          },
        ],
        reactFlowNodes: [
          {
            id: 'topic 1',
            data: { label: 'topic 1' },
            type: 'default',
            position: { x: 100, y: 100 },
          },
          {
            id: 'topic 2',
            data: { label: 'topic 2' },
            type: 'default',
            position: { x: 300, y: 100 },
          },
          {
            id: 'topic 3',
            data: { label: 'topic 3' },
            type: 'default',
            position: { x: 300, y: 300 },
          },
          {
            id: 'topic 4',
            data: { label: 'topic 4' },
            type: 'default',
            position: { x: 500, y: 300 },
          },
        ],
      },
    ],
  },
]

export const testStudentGraphData = [
  // for class_id = 1
  {
    nodes: [
      {
        id: '1',
        label: 'topic 1',
        position: { x: 100, y: 100 },
        progress: 0.57,
        isActive: false,
      },
      {
        id: '2',
        label: 'topic 2',
        position: { x: 300, y: 100 },
        progress: 1,
        isActive: false,
      },
      {
        id: '3',
        label: 'topic 3',
        position: { x: 300, y: 300 },
        progress: 0.7,
        isActive: false,
      },
      {
        id: '4',
        label: 'topic 4',
        position: { x: 500, y: 300 },
        progress: 0.5,
        isActive: false,
      },
    ],
    edges: [
      { source: '1', target: '2' },
      { source: '1', target: '3' },
      { source: '2', target: '3' },
      { source: '3', target: '4' },
    ],
    trackingThreshold: 10,
  },
]
