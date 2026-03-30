from pydantic import BaseModel, Field
from typing import Optional, Literal, List

# 1. Структура элемента страницы (входные данные)
class PageElement(BaseModel):
    type: str = Field(description="Тип элемента: header, interactive, content, image")
    text: str = Field(description="Текст элемента")
    selector: str = Field(description="Уникальный CSS селектор")
    importance: Optional[int] = 0

# 2a. Одно поле для заполнения
class MascotFieldFill(BaseModel):
    selector: str  = Field(description="CSS-селектор поля ввода.")
    value:    str  = Field(description="Значение для вставки в поле.")

# 2b. Структура действия (часть ответа)
class MascotActionParams(BaseModel):
    type: Literal['HIGHLIGHT', 'NAVIGATE', 'FILL_INPUT', 'FILL_INPUTS'] = Field(
        description=(
            "Тип действия: "
            "HIGHLIGHT — подсветить элемент; "
            "NAVIGATE — клик/переход; "
            "FILL_INPUT — вставить текст в одно поле (selector + value); "
            "FILL_INPUTS — заполнить несколько полей сразу (fields)."
        )
    )
    selector: Optional[str]               = Field(default=None, description="CSS-селектор (для HIGHLIGHT, NAVIGATE, FILL_INPUT).")
    value:    Optional[str]               = Field(default=None, description="Текст для вставки (только FILL_INPUT).")
    fields:   Optional[List[MascotFieldFill]] = Field(default=None, description="Список полей для заполнения (только FILL_INPUTS).")

# 3. Структура ответа AI (выходные данные)
class MascotResponse(BaseModel):
    response_text: str = Field(description="Ответ маскота. Должен быть кратким, дружелюбным и в стиле помощника.")
    action: Optional[MascotActionParams] = Field(
        default=None, 
        description="Объект действия. Заполни его, если пользователь просит показать/найти что-то на странице."

    )
