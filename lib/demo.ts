import type { Language, Plan } from './schema';

/**
 * Sample plans shown when the app runs in demo mode or the daily AI budget is spent.
 * They are written by hand (no AI call), in both interface languages.
 */

type DaySpec = readonly [title: string, objective: string, topics: string[], exercises: string[], resources: [string, string][]];

const build = (subject: string, level: Plan['level'], minutes: number, days: DaySpec[]): Plan => ({
  subject,
  level,
  days: days.map(([title, objective, topics, exercises, resources], index) => ({
    day: index + 1,
    title,
    objective,
    topics,
    exercises,
    resources: resources.map(([resourceTitle, query]) => ({ title: resourceTitle, query })),
    minutes,
  })),
});

const JAVASCRIPT: Record<Language, Plan> = {
  pt: build('JavaScript do zero', 'beginner', 60, [
    [
      'Variáveis e tipos',
      'Declarar valores e entender os tipos básicos.',
      ['let, const e var', 'Números, textos e booleanos', 'Conversão de tipos'],
      ['Declare 5 variáveis de tipos diferentes e mostre cada uma com console.log.'],
      [['Guia de JavaScript da MDN', 'MDN JavaScript Guide grammar and types']],
    ],
    [
      'Condições e laços',
      'Controlar o fluxo do programa com if, for e while.',
      ['if / else', 'Operadores de comparação', 'for e while'],
      ['Escreva um laço que imprime os números pares de 1 a 20.', 'Crie um FizzBuzz.'],
      [['Fluxo de controle na MDN', 'MDN control flow and error handling']],
    ],
    [
      'Funções',
      'Agrupar lógica em funções reutilizáveis.',
      ['Declaração e arrow functions', 'Parâmetros e retorno', 'Escopo'],
      ['Crie uma função que calcula a média de uma lista de números.'],
      [['Funções na MDN', 'MDN JavaScript functions']],
    ],
    [
      'Arrays e objetos',
      'Guardar e transformar coleções de dados.',
      ['Criar e percorrer arrays', 'map, filter e reduce', 'Objetos e propriedades'],
      ['Dado um array de produtos, some o preço dos itens com estoque.'],
      [['Arrays na MDN', 'MDN JavaScript arrays map filter reduce']],
    ],
    [
      'Mini projeto: lista de tarefas',
      'Juntar o que foi visto em um programa pequeno.',
      ['Estrutura de dados da lista', 'Funções de adicionar e remover', 'Revisão da semana'],
      ['Monte uma lista de tarefas no console que adiciona, remove e marca como concluída.'],
      [['Projetos para iniciantes', 'javascript beginner projects']],
    ],
  ]),
  en: build('JavaScript from scratch', 'beginner', 60, [
    [
      'Variables and types',
      'Declare values and understand the basic types.',
      ['let, const and var', 'Numbers, strings and booleans', 'Type conversion'],
      ['Declare 5 variables of different types and print each one with console.log.'],
      [['MDN JavaScript guide', 'MDN JavaScript Guide grammar and types']],
    ],
    [
      'Conditions and loops',
      'Control program flow with if, for and while.',
      ['if / else', 'Comparison operators', 'for and while'],
      ['Write a loop that prints the even numbers from 1 to 20.', 'Build a FizzBuzz.'],
      [['MDN control flow', 'MDN control flow and error handling']],
    ],
    [
      'Functions',
      'Group logic into reusable functions.',
      ['Declarations and arrow functions', 'Parameters and return values', 'Scope'],
      ['Write a function that returns the average of a list of numbers.'],
      [['MDN functions', 'MDN JavaScript functions']],
    ],
    [
      'Arrays and objects',
      'Store and transform collections of data.',
      ['Creating and looping over arrays', 'map, filter and reduce', 'Objects and properties'],
      ['Given an array of products, add up the price of the items in stock.'],
      [['MDN arrays', 'MDN JavaScript arrays map filter reduce']],
    ],
    [
      'Mini project: to-do list',
      'Put everything together in a small program.',
      ['Data structure for the list', 'Add and remove functions', "Week's review"],
      ['Build a console to-do list that adds, removes and completes tasks.'],
      [['Beginner project ideas', 'javascript beginner projects']],
    ],
  ]),
};

const LEARNING: Record<Language, Plan> = {
  pt: build('Como aprender qualquer assunto', 'beginner', 45, [
    [
      'Defina o objetivo',
      'Saber exatamente o que você quer ser capaz de fazer no fim.',
      ['Objetivo concreto e mensurável', 'Prazo realista', 'O que fica de fora'],
      ['Escreva uma frase: "Em 5 dias eu quero conseguir..."'],
      [['Como definir metas de estudo', 'smart goals for studying']],
    ],
    [
      'Mapeie o assunto',
      'Quebrar o tema em partes pequenas e ordená-las.',
      ['Tópicos principais', 'Pré-requisitos', 'Ordem de estudo'],
      ['Liste de 8 a 10 tópicos e numere-os do mais básico ao mais avançado.'],
      [['Técnica do mapa mental', 'how to make a mind map for learning']],
    ],
    [
      'Estude com recordação ativa',
      'Aprender testando a memória em vez de só reler.',
      ['Recordação ativa', 'Perguntas no lugar de resumos', 'Erros como informação'],
      ['Estude um tópico por 25 minutos e escreva tudo que lembra sem consultar.'],
      [['Active recall explicado', 'active recall study technique']],
    ],
    [
      'Revisão espaçada',
      'Revisar no momento certo para fixar.',
      ['Curva do esquecimento', 'Intervalos de revisão', 'Cartões de memória'],
      ['Crie 10 cartões com o que viu até agora e revise-os.'],
      [['Spaced repetition', 'spaced repetition how it works']],
    ],
    [
      'Aplique e meça',
      'Usar o que aprendeu em algo real e ver o que falta.',
      ['Projeto pequeno', 'Ensinar a alguém', 'Próximos passos'],
      ['Explique o assunto em voz alta por 3 minutos e anote as partes em que travou.'],
      [['Técnica de Feynman', 'Feynman technique learning']],
    ],
  ]),
  en: build('How to learn anything', 'beginner', 45, [
    [
      'Set the goal',
      'Know exactly what you want to be able to do at the end.',
      ['A concrete, measurable goal', 'A realistic deadline', 'What is out of scope'],
      ['Write one sentence: "In 5 days I want to be able to..."'],
      [['How to set study goals', 'smart goals for studying']],
    ],
    [
      'Map the subject',
      'Break the topic into small parts and put them in order.',
      ['Main topics', 'Prerequisites', 'Study order'],
      ['List 8 to 10 topics and number them from most basic to most advanced.'],
      [['Mind map technique', 'how to make a mind map for learning']],
    ],
    [
      'Study with active recall',
      'Learn by testing your memory instead of only rereading.',
      ['Active recall', 'Questions instead of summaries', 'Mistakes as information'],
      ['Study one topic for 25 minutes, then write down everything you remember without looking.'],
      [['Active recall explained', 'active recall study technique']],
    ],
    [
      'Spaced repetition',
      'Review at the right moment to make it stick.',
      ['The forgetting curve', 'Review intervals', 'Flashcards'],
      ['Make 10 flashcards from what you have seen so far and review them.'],
      [['Spaced repetition', 'spaced repetition how it works']],
    ],
    [
      'Apply and measure',
      'Use what you learned on something real and see what is missing.',
      ['A small project', 'Teaching someone', 'Next steps'],
      ['Explain the subject out loud for 3 minutes and note where you got stuck.'],
      [['The Feynman technique', 'Feynman technique learning']],
    ],
  ]),
};

const PROGRAMMING = /\b(java\s?script|js|typescript|node(\.?js)?|react|next(\.?js)?|vue|html|css|web|programa[çc][ãa]o|programming|c[oó]digo|code|coding|dev|developer)\b/i;

/** Picks the sample closest to the subject, shortened to the number of days asked for (never longer). */
export function pickDemoPlan(subject: string, days: number, language: Language): Plan {
  const source = (PROGRAMMING.test(subject) ? JAVASCRIPT : LEARNING)[language];
  return { ...source, days: source.days.slice(0, Math.max(1, days)) };
}
